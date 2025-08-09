/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  Content,
  Part,
  FinishReason,
} from '@google/genai';
import { ContentGenerator } from './contentGenerator.js';

interface AzureFoundryMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

interface AzureFoundryChatCompletionRequest {
  model?: string;
  messages: AzureFoundryMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
  }>;
}

interface AzureFoundryChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class AzureFoundryContentGenerator implements ContentGenerator {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly deployment: string;
  private readonly apiVersion: string = '2024-10-21';

  constructor(
    endpoint: string,
    apiKey: string,
    deployment: string = 'gpt-4o',
  ) {
    this.endpoint = endpoint.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = apiKey;
    this.deployment = deployment;
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const azureRequest = this.convertToAzureRequest(request);
    const url = `${this.endpoint}/openai/deployments/${this.deployment}/chat/completions?api-version=${this.apiVersion}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: JSON.stringify(azureRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure Foundry API error: ${response.status} ${response.statusText}: ${errorText}`);
    }

    const azureResponse: AzureFoundryChatCompletionResponse = await response.json();
    return this.convertFromAzureResponse(azureResponse);
  }

  async *generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): AsyncGenerator<GenerateContentResponse> {
    const azureRequest = { ...this.convertToAzureRequest(request), stream: true };
    const url = `${this.endpoint}/openai/deployments/${this.deployment}/chat/completions?api-version=${this.apiVersion}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: JSON.stringify(azureRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure Foundry API error: ${response.status} ${response.statusText}: ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('data: ')) {
            const data = trimmedLine.slice(6);
            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const geminiResponse = this.convertFromAzureStreamChunk(parsed);
              if (geminiResponse) {
                yield geminiResponse;
              }
            } catch (e) {
              // Skip invalid JSON chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Azure Foundry doesn't have a direct token counting endpoint
    // We'll estimate based on content length (rough approximation: 4 chars = 1 token)
    const content = JSON.stringify(request.contents);
    const estimatedTokens = Math.ceil(content.length / 4);
    
    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    // Azure Foundry embeddings would require a different endpoint and model
    // For now, we'll return an error indicating this feature is not supported
    throw new Error('Embeddings are not yet supported with Azure Foundry integration');
  }

  private convertToAzureRequest(request: GenerateContentParameters): AzureFoundryChatCompletionRequest {
    const messages: AzureFoundryMessage[] = [];

    // Add system instruction if present
    if (request.config?.systemInstruction) {
      const systemContent = typeof request.config.systemInstruction === 'string' 
        ? request.config.systemInstruction 
        : request.config.systemInstruction.text || '';
      messages.push({
        role: 'system',
        content: systemContent,
      });
    }

    // Convert Gemini contents to Azure messages
    for (const content of request.contents) {
      const role = content.role === 'model' ? 'assistant' : 'user';
      const messageContent = this.convertPartsToContent(content.parts);
      messages.push({
        role,
        content: messageContent,
      });
    }

    // Convert tools if present
    let tools: Array<{
      type: 'function';
      function: {
        name: string;
        description?: string;
        parameters?: Record<string, unknown>;
      };
    }> | undefined;

    if (request.config?.tools && request.config.tools.length > 0) {
      tools = [];
      for (const tool of request.config.tools) {
        if (tool.functionDeclarations) {
          for (const func of tool.functionDeclarations) {
            tools.push({
              type: 'function',
              function: {
                name: func.name,
                description: func.description,
                parameters: func.parametersJsonSchema || func.parameters,
              },
            });
          }
        }
      }
    }

    return {
      model: this.deployment,
      messages,
      temperature: request.config?.temperature,
      max_tokens: 4096, // Azure Foundry default
      top_p: request.config?.topP,
      tools: tools && tools.length > 0 ? tools : undefined,
    };
  }

  private convertPartsToContent(parts: Part[]): string {
    return parts.map(part => {
      if (part.text) return part.text;
      if (part.functionCall) {
        return `Function call: ${part.functionCall.name}(${JSON.stringify(part.functionCall.args)})`;
      }
      if (part.functionResponse) {
        return `Function response: ${JSON.stringify(part.functionResponse.response)}`;
      }
      return '';
    }).join('');
  }

  private convertFromAzureResponse(azureResponse: AzureFoundryChatCompletionResponse): GenerateContentResponse {
    const choice = azureResponse.choices[0];
    if (!choice) {
      throw new Error('No choices in Azure Foundry response');
    }

    const parts: Part[] = [];
    
    if (choice.message.content) {
      parts.push({ text: choice.message.content });
    }

    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        parts.push({
          functionCall: {
            name: toolCall.function.name,
            args: JSON.parse(toolCall.function.arguments),
          },
        });
      }
    }

    const finishReason = this.convertFinishReason(choice.finish_reason);

    return {
      candidates: [{
        content: {
          parts,
          role: 'model',
        },
        finishReason,
        index: choice.index,
      }],
      usageMetadata: azureResponse.usage ? {
        promptTokenCount: azureResponse.usage.prompt_tokens,
        candidatesTokenCount: azureResponse.usage.completion_tokens,
        totalTokenCount: azureResponse.usage.total_tokens,
      } : undefined,
    };
  }

  private convertFromAzureStreamChunk(chunk: any): GenerateContentResponse | null {
    const choice = chunk.choices?.[0];
    if (!choice) return null;

    const parts: Part[] = [];
    
    if (choice.delta?.content) {
      parts.push({ text: choice.delta.content });
    }

    if (choice.delta?.tool_calls) {
      for (const toolCall of choice.delta.tool_calls) {
        if (toolCall.function?.name && toolCall.function?.arguments) {
          parts.push({
            functionCall: {
              name: toolCall.function.name,
              args: JSON.parse(toolCall.function.arguments),
            },
          });
        }
      }
    }

    if (parts.length === 0) return null;

    const finishReason = this.convertFinishReason(choice.finish_reason);

    return {
      candidates: [{
        content: {
          parts,
          role: 'model',
        },
        finishReason,
        index: choice.index || 0,
      }],
    };
  }

  private convertFinishReason(azureFinishReason: string | null): FinishReason | undefined {
    switch (azureFinishReason) {
      case 'stop':
        return FinishReason.STOP;
      case 'length':
        return FinishReason.MAX_TOKENS;
      case 'tool_calls':
        return FinishReason.STOP;
      case 'content_filter':
        return FinishReason.SAFETY;
      default:
        return FinishReason.OTHER;
    }
  }
}
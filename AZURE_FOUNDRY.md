# Azure Foundry Integration

This document describes how to use Azure AI Foundry models with the Gemini CLI.

## Setup

### 1. Get Azure Foundry Credentials

You need to set up the following environment variables:

- `AZURE_FOUNDRY_API_KEY`: Your Azure AI Foundry API key
- `AZURE_FOUNDRY_ENDPOINT`: Your Azure AI Foundry project endpoint  
- `AZURE_FOUNDRY_DEPLOYMENT`: The deployment name (optional, defaults to `gpt-4o`)

### 2. Set Environment Variables

You can set these in several ways:

#### Option A: Environment Variables
```bash
export AZURE_FOUNDRY_API_KEY="your-api-key"
export AZURE_FOUNDRY_ENDPOINT="https://your-resource.services.ai.azure.com/api/projects/your-project"
export AZURE_FOUNDRY_DEPLOYMENT="gpt-4o"  # Optional
```

#### Option B: .env file
Create a `.env` file in your project directory:
```env
AZURE_FOUNDRY_API_KEY=your-api-key
AZURE_FOUNDRY_ENDPOINT=https://your-resource.services.ai.azure.com/api/projects/your-project
AZURE_FOUNDRY_DEPLOYMENT=gpt-4o  # Optional
```

### 3. Authentication

When you run the Gemini CLI, you'll see "Azure Foundry" as an authentication option if your credentials are properly configured. Select it to use Azure AI Foundry models.

## Supported Features

✅ **Chat completions** - Full conversation support  
✅ **Function calling** - Tool integration works  
✅ **Streaming** - Real-time response streaming  
✅ **System instructions** - Custom prompts supported  
⚠️ **Token counting** - Basic estimation (not exact)  
❌ **Embeddings** - Not yet supported  

## Azure Foundry Endpoint Format

Your endpoint should follow this format:
```
https://<AIFoundryResourceName>.services.ai.azure.com/api/projects/<ProjectName>
```

## Available Models

The integration works with any Azure AI Foundry deployment. Common models include:
- `gpt-4o` (default)
- `gpt-4o-mini`
- `gpt-4-turbo`
- Custom fine-tuned models

## Troubleshooting

### Error: "Azure Foundry endpoint and API key are required"
Make sure both `AZURE_FOUNDRY_API_KEY` and `AZURE_FOUNDRY_ENDPOINT` environment variables are set.

### Error: "Azure Foundry API error: 401"
Check that your API key is valid and has the necessary permissions.

### Error: "Azure Foundry API error: 404"
Verify your endpoint URL is correct and the deployment exists.

### Model not found
Ensure the `AZURE_FOUNDRY_DEPLOYMENT` matches an actual deployment in your Azure AI Foundry project.

## Example Usage

1. Set environment variables
2. Run the CLI: `gemini-cli`
3. Select "Azure Foundry" when prompted for authentication
4. Start chatting with Azure AI Foundry models

The CLI will automatically handle conversation context, function calling, and all other features using the Azure AI Foundry API.
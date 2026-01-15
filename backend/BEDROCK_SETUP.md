# AWS Bedrock Setup Guide

## Problem
You're getting this error:
```
AccessDeniedException: Model access is denied due to IAM user or service role is not authorized to perform the required AWS Marketplace actions (aws-marketplace:ViewSubscriptions, aws-marketplace:Subscribe)
```

## Solution

### Step 1: Enable the Model in Bedrock Console (REQUIRED)

The Model access page has been retired. Use the new interface:

**Option A: Via Model Catalog (Recommended)**
1. Go to **AWS Console** → **Amazon Bedrock**
2. Navigate to **Model catalog** in the left sidebar (or **Foundation models**)
3. Search for **"Claude Haiku 4.5"** or filter by **Anthropic**
4. Find **Anthropic Claude Haiku 4.5** and use its **inference profile ARN** (example):
   `arn:aws:bedrock:us-east-1:244271315858:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0`
5. Click on the model card
6. Click **Request model access** or **Enable** button
7. Fill out the use case form if prompted:
   - **Use case**: Select "Text generation" or "Conversational AI"
   - **Description**: "Voice transcript processing and task extraction for personal productivity app"
   - Accept terms and submit
8. Wait for approval (usually instant for Claude models, but can take a few minutes)

**Option B: Via Playground**
1. Go to **AWS Console** → **Amazon Bedrock**
2. Navigate to **Playground** → **Chat** or **Text**
3. Try to select **Claude Haiku 4.5** from the model dropdown
4. If it's not available, you'll see a prompt to enable it - click that
5. Follow the prompts to request access

**Option C: Via API/CLI (if console doesn't work)**
```bash
aws bedrock list-foundation-models --region us-east-1 --query "modelSummaries[?modelId=='anthropic.claude-haiku-4-5-20251001-v1:0']"
```
Then use the AWS console to enable it from the model details page.

### Step 2: Verify IAM Permissions

The Lambda function needs these permissions (already in `template.yaml`):
- `bedrock:InvokeModel`
- `bedrock:Converse`
- `bedrock:ConverseStream`

After enabling the model, redeploy your stack:

```bash
cd backend
sam build
sam deploy
```

### Step 3: Test Again

After enabling the model and redeploying, test the ingest API again. The error should be resolved.

## Alternative: Use a Different Model

If you want to use a different model that's already enabled:

1. Check which models you have access to in Bedrock Console → Model access
2. Update `BEDROCK_MODEL_ID` in `template.yaml` (line 186) to use an enabled model
3. Redeploy

## Troubleshooting

- **Still getting AccessDenied?** 
  - Wait 5 minutes after enabling (AWS needs time to propagate)
  - Check CloudWatch logs for the Lambda function to see the exact error
  - Verify the model is showing as "Access granted" in Bedrock Console

- **Model not showing in list?**
  - Make sure you're in the correct AWS region (us-east-1 for most models)
  - Some models require AWS account approval - contact AWS support if needed

- **IAM permissions issue?**
  - The template already includes the necessary permissions
  - If you're using a custom IAM role, ensure it has `bedrock:Converse` permission

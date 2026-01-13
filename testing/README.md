# ABBI Testing Deployments

## Structure
Testing deployments are accessible at: `https://abbi-ai.com/testing/`

Each test revision should follow the naming convention: `v[number]_YYYYMMDD`

## How to Create a New Test Deployment

1. **Create a test folder:**
   ```bash
   mkdir -p testing/v2_20260113
   ```

2. **Copy the current site files into the test folder:**
   ```bash
   cp index.html testing/v2_20260113/
   cp -r api testing/v2_20260113/ (if needed)
   ```

3. **Make your test changes in that folder**

4. **Update testing/index.html** to add a link to the new test deployment

5. **Commit and push:**
   ```bash
   git add testing/
   git commit -m "Add test deployment v2_20260113: [description]"
   git push
   ```

6. **Access the test at:**
   `https://abbi-ai.com/testing/v2_20260113/`

## Current Test Deployments

- **v1_20260112**: ElevenLabs client v0.12.2, optimized turn detection, built-in Claude Haiku

## Notes

- Each test deployment is a snapshot of the site at a specific revision
- Tests persist until manually removed
- Production site remains at https://abbi-ai.com

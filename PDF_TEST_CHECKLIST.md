# PDF Upload & Summarization Test Checklist

## ✅ Pre-Test Setup

### 1. Environment Variables
Check your `.env` file has:
- ✅ `VITE_HF_API_KEY` - Your Hugging Face API key
- ✅ `VITE_HF_LLAMA3_MODEL` - Model name (default: `meta-llama/Llama-3.1-8B-Instruct`)
- ✅ `VITE_USE_HF_PROVIDER=false` - For free tier

### 2. Hugging Face License
⚠️ **Important:** If using Llama model:
- Make sure you've accepted the license agreement on Hugging Face
- Visit: https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct
- Click "Agree and access repository"
- Wait for approval (if still pending, API calls will fail)

### 3. PDF Worker File
The app needs `/pdf.worker.min.mjs` in the `public/` folder. If missing:
- Check if file exists: `public/pdf.worker.min.mjs`
- If missing, we may need to copy it from `node_modules/pdfjs-dist/build/`

### 4. Authentication
- Make sure you're logged in to the app
- The app now requires authentication (Supabase)

## 🧪 Testing Steps

### Step 1: Upload PDF
1. Click "Upload PDF/Document" button
2. Select a PDF file (max 20 MB)
3. Wait for processing (may take 30-60 seconds)
4. You should see: "PDF processed! Extracted X characters from Y pages."

### Step 2: Request Summary
Try these prompts:
- "Summarize this document"
- "What is this document about?"
- "Give me the main points"

### Step 3: Verify Results
- ✅ PDF text is extracted (you can download as TXT/MD/CSV)
- ✅ Chat interface works
- ✅ AI responds with summary based on document content

## 🐛 Troubleshooting

### Error: "PDF conversion failed"
- **Cause:** PDF.js worker issues or OCR problems
- **Solution:** 
  - Check browser console for errors
  - Try a simpler PDF (text-based, not scanned)
  - Check if `/pdf.worker.min.mjs` exists in `public/` folder

### Error: "Model not found (404)"
- **Cause:** License not approved or model name wrong
- **Solution:**
  - Verify license acceptance on Hugging Face
  - Check model name in `.env` file
  - Wait a few minutes after accepting license

### Error: "Hugging Face API Key is not configured"
- **Cause:** Missing or incorrect API key
- **Solution:**
  - Check `.env` file has `VITE_HF_API_KEY=your_key_here`
  - Restart dev server after changing `.env`

### Error: "CORS policy" or network errors
- **Cause:** Proxy not working
- **Solution:**
  - Check `vite.config.js` has proxy configuration
  - Restart dev server
  - Check browser console for detailed error

### PDF processes but AI doesn't respond
- **Cause:** Document content not included in prompt
- **Solution:**
  - Check that `fileContent.text` exists after upload
  - Verify document context is added to system prompt
  - Check browser console for API errors

## 📝 Expected Behavior

### Successful Flow:
1. **Upload PDF** → Shows "Converting PDF pages to text via OCR..."
2. **Processing** → Extracts text from each page
3. **Complete** → Shows "PDF processed! Extracted X characters from Y pages"
4. **Chat Ready** → You can now ask questions about the document
5. **AI Response** → AI summarizes/answers based on document content

### Document Content Inclusion:
- First 8000 characters are included in the system prompt
- Full document is available for processing
- You can download the extracted text

## 🔍 Quick Diagnostic Commands

### Check if PDF worker exists:
```bash
ls public/pdf.worker.min.mjs
```

### Check environment variables:
```bash
# Windows PowerShell
Get-Content .env | Select-String "HF"
```

### Check if dev server is running:
```bash
npm run dev
```

## 💡 Tips

1. **Start Small:** Test with a simple, text-based PDF first (not scanned images)
2. **Check Console:** Open browser DevTools (F12) to see detailed errors
3. **Wait for Processing:** PDF processing can take 30-60 seconds for large files
4. **Free Tier:** With `VITE_USE_HF_PROVIDER=false`, responses may be slower but free

## 🎯 Success Indicators

✅ PDF uploads without errors  
✅ Text extraction completes successfully  
✅ Extracted text is visible/downloadable  
✅ Chat interface accepts messages  
✅ AI responds with document-based answers  
✅ Summary includes information from the PDF  

## 📞 If Issues Persist

1. Check browser console (F12) for detailed errors
2. Check terminal where dev server is running for errors
3. Verify all environment variables are set correctly
4. Ensure Hugging Face license is approved
5. Try a different PDF file (smaller, text-based)

Good luck with your test! 🚀


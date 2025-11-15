Place uploaded product images here if you want them served directly by the backend.

The server exposes files under /uploads. For example, a file saved at `public/images/products/abc.jpg` will be available at:

  http://<host>:4000/uploads/products/abc.jpg

Note: The server will create `public/images` automatically at startup if it doesn't exist. Use the `/api/uploads` endpoint to upload files programmatically (multipart or base64 fallback).
import React, { useState } from 'react';

interface UploadResponse {
  success: boolean;
  uploadUrl: string;
  key: string;
  fields?: any;
  expiresIn: number;
}

interface ConfirmResponse {
  success: boolean;
  message: string;
  data: {
    _id: string;
    filename: string;
    originalName: string;
    url: string;
    size: number;
    type: string;
    category: string;
    uploadDate: string;
  };
}

const PresignedUpload: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);

  const API_BASE = process.env.REACT_APP_API_BASE || 'https://your-api-gateway-url.com/prod/api';
  const authToken = localStorage.getItem('authToken'); // Get from your auth system

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setSelectedFile(file || null);
    
    if (file) {
      setStatus({
        message: `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
        type: 'info'
      });
    }
  };

  const uploadFile = async () => {
    if (!selectedFile || !authToken) return;

    try {
      setUploading(true);
      setProgress(0);
      setStatus({ message: 'Getting upload URL...', type: 'info' });

      // Step 1: Get presigned URL
      const presignedResponse = await fetch(`${API_BASE}/upload/presigned-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileType: selectedFile.type,
          fileSize: selectedFile.size
        })
      });

      if (!presignedResponse.ok) {
        const error = await presignedResponse.json();
        throw new Error(error.message || 'Failed to get upload URL');
      }

      const uploadData: UploadResponse = await presignedResponse.json();

      // Step 2: Upload directly to S3 with progress tracking
      setStatus({ message: 'Uploading to S3...', type: 'info' });

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            setProgress(percentComplete);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            resolve();
          } else {
            reject(new Error('Upload to S3 failed'));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Upload to S3 failed'));
        });

        xhr.open('PUT', uploadData.uploadUrl);
        xhr.setRequestHeader('Content-Type', selectedFile.type);
        xhr.send(selectedFile);
      });

      setStatus({ message: 'Confirming upload...', type: 'info' });

      // Step 3: Confirm upload with your API
      const confirmResponse = await fetch(`${API_BASE}/upload/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          key: uploadData.key,
          fileName: selectedFile.name,
          fileType: selectedFile.type,
          fileSize: selectedFile.size
        })
      });

      if (!confirmResponse.ok) {
        const error = await confirmResponse.json();
        throw new Error(error.message || 'Failed to confirm upload');
      }

      const result: ConfirmResponse = await confirmResponse.json();
      setStatus({
        message: `Upload successful! File ID: ${result.data._id}`,
        type: 'success'
      });

      // Reset form
      setSelectedFile(null);
      setProgress(0);
      
      // Reset file input
      const fileInput = document.getElementById('fileInput') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

    } catch (error) {
      setStatus({
        message: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error'
      });
      setProgress(0);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h2>Upload PDF File</h2>
      
      <div style={{
        border: '2px dashed #ccc',
        padding: '20px',
        textAlign: 'center',
        margin: '20px 0',
        borderRadius: '8px'
      }}>
        <input
          id="fileInput"
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          disabled={uploading}
          style={{ marginBottom: '10px' }}
        />
        <p>Select a PDF file to upload (up to 50MB)</p>
      </div>

      <button
        onClick={uploadFile}
        disabled={!selectedFile || uploading || !authToken}
        style={{
          padding: '10px 20px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: selectedFile && !uploading && authToken ? 'pointer' : 'not-allowed',
          opacity: selectedFile && !uploading && authToken ? 1 : 0.6
        }}
      >
        {uploading ? 'Uploading...' : 'Upload File'}
      </button>

      {uploading && (
        <div style={{ margin: '20px 0' }}>
          <div style={{
            width: '100%',
            height: '20px',
            backgroundColor: '#f0f0f0',
            borderRadius: '10px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              backgroundColor: '#4CAF50',
              width: `${progress}%`,
              transition: 'width 0.3s ease'
            }} />
          </div>
          <p style={{ textAlign: 'center', margin: '5px 0' }}>{progress}%</p>
        </div>
      )}

      {status && (
        <div style={{
          margin: '20px 0',
          padding: '10px',
          borderRadius: '4px',
          backgroundColor: status.type === 'success' ? '#d4edda' : 
                          status.type === 'error' ? '#f8d7da' : '#d1ecf1',
          color: status.type === 'success' ? '#155724' : 
                 status.type === 'error' ? '#721c24' : '#0c5460',
          border: `1px solid ${status.type === 'success' ? '#c3e6cb' : 
                              status.type === 'error' ? '#f5c6cb' : '#bee5eb'}`
        }}>
          {status.message}
        </div>
      )}

      {!authToken && (
        <div style={{
          margin: '20px 0',
          padding: '10px',
          borderRadius: '4px',
          backgroundColor: '#fff3cd',
          color: '#856404',
          border: '1px solid #ffeaa7'
        }}>
          Please log in to upload files.
        </div>
      )}
    </div>
  );
};

export default PresignedUpload;

import React, { useState, useRef, useCallback } from 'react';
import { createWorker } from 'tesseract.js';
import Webcam from "react-webcam";
import axios from 'axios';
import './App.css';

const HandwritingToText = () => {
  const [image, setImage] = useState(null);
  const [text, setText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [activeTab, setActiveTab] = useState('camera'); // 'camera' or 'upload'
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const languages = [
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ru', name: 'Russian' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ar', name: 'Arabic' },
  ];

  const captureImage = () => {
    const imageSrc = webcamRef.current.getScreenshot();
    setImage(imageSrc);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImage(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  const clearAll = () => {
    setImage(null);
    setText('');
    setTranslatedText('');
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const convertImageToText = useCallback(async () => {
    if (!image) return;
    
    setIsProcessing(true);
    setProgress(0);
    
    try {
      const worker = await createWorker();
      
      worker.onProgress = (p) => {
        if (p.status === 'recognizing text') {
          setProgress(parseInt(p.progress * 100));
        }
      };

      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      await worker.setParameters({
        tessedit_pageseg_mode: 7,
        tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,!?()',
      });

      const { data: { text } } = await worker.recognize(image);
      setText(text);
      
      await worker.terminate();
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  }, [image]);

  const translateText = async () => {
    if (!text) return;
    
    setIsTranslating(true);
    try {
      const response = await axios.post(
        'https://libretranslate.de/translate',
        {
          q: text,
          source: 'en',
          target: targetLanguage,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      setTranslatedText(response.data.translatedText);
    } catch (err) {
      console.error('Translation error:', err);
      setTranslatedText('Translation failed. Please try again.');
    } finally {
      setIsTranslating(false);
    }
  };

  const drawOnCanvas = () => {
    if (!canvasRef.current || !image) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    };
    img.src = image;
  };

  return (
    <div className="container">
      <h1>Handwriting to Text Converter with Translation</h1>
      
      <div className="input-methods">
        <button
          className={`tab-button ${activeTab === 'camera' ? 'active' : ''}`}
          onClick={() => setActiveTab('camera')}
        >
          Use Camera
        </button>
        <button
          className={`tab-button ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          Upload Image
        </button>
      </div>
      
      {activeTab === 'camera' ? (
        <div className="webcam-container">
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={{
              facingMode: 'environment'
            }}
          />
          <button onClick={captureImage}>Capture Image</button>
        </div>
      ) : (
        <div className="upload-container">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            style={{ display: 'none' }}
          />
          <button onClick={triggerFileInput}>Select Image</button>
          {image && (
            <div className="image-preview">
              <h3>Selected Image:</h3>
              <img src={image} alt="uploaded preview" />
            </div>
          )}
        </div>
      )}
      
      {image && (
        <div className="processing-container">
          <div className="image-preview">
            <h3>Current Image:</h3>
            <img src={image} alt="current" onLoad={drawOnCanvas} />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>
          
          <div className="buttons">
            <button onClick={clearAll}>Clear All</button>
            <button 
              onClick={convertImageToText} 
              disabled={isProcessing}
            >
              {isProcessing ? `Processing... ${progress}%` : 'Extract Text'}
            </button>
          </div>
        </div>
      )}
      
      {text && (
        <div className="result-container">
          <h3>Extracted Text:</h3>
          <div className="text-result">{text}</div>
          
          <div className="translation-section">
            <div className="language-selector">
              <label htmlFor="targetLanguage">Translate to:</label>
              <select
                id="targetLanguage"
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                disabled={isTranslating}
              >
                {languages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>
            
            <button 
              onClick={translateText} 
              disabled={isTranslating || !text}
            >
              {isTranslating ? 'Translating...' : 'Translate'}
            </button>
          </div>
        </div>
      )}
      
      {translatedText && (
        <div className="result-container">
          <h3>Translated Text ({languages.find(l => l.code === targetLanguage)?.name}):</h3>
          <div className="text-result">{translatedText}</div>
        </div>
      )}
    </div>
  );
};

export default HandwritingToText;
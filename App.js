import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { 
  Box, Container, Typography, Button, CircularProgress, Select, MenuItem, 
  Paper, TextField, FormControl, InputLabel, Tooltip, IconButton, 
  createTheme, ThemeProvider, CssBaseline, Dialog, DialogTitle, 
  DialogContent, DialogActions
} from '@mui/material';
import { 
  CloudUpload, SwapHoriz, Info, Translate, Brightness4, Brightness7, 
  VolumeUp, History, Clear, CameraAlt, Mic, Stop, Videocam 
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import Tesseract from 'tesseract.js';
import axios from 'axios';
import Webcam from 'react-webcam';
import './App.css';

// Initialize SpeechRecognition
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;
if (recognition) {
  recognition.continuous = true;
  recognition.interimResults = true;
}

function App() {
  // State declarations
  const [mode, setMode] = useState('light');
  const [image, setImage] = useState(null);
  const [extractedText, setExtractedText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [apiProvider, setApiProvider] = useState('libretranslate');
  const [error, setError] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showTextLimitWarning, setShowTextLimitWarning] = useState(false);
  const [apiStatus, setApiStatus] = useState({
    libretranslate: true,
    mymemory: true,
    google: true,
    azure: true,
    deepl: true
  });

  // New state for Camera OCR
  const [showCamera, setShowCamera] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const webcamRef = React.useRef(null);
  
  // New state for Voice Typing
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');

  // Constants
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
    { code: 'ur', name: 'Urdu' },
  ];

  const apiProviders = [
    { id: 'libretranslate', name: 'LibreTranslate', free: true },
    { id: 'mymemory', name: 'MyMemory', free: true },
    { id: 'google', name: 'Google Cloud', free: false },
    { id: 'azure', name: 'Microsoft Azure', free: false },
    { id: 'deepl', name: 'DeepL', free: false }
  ];

  // Theme setup
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          ...(mode === 'light' ? {} : {
            background: {
              default: '#121212',
              paper: '#1E1E1E',
            },
          }),
        },
      }),
    [mode],
  );

  // Effects
  useEffect(() => {
    if (!recognition) return;

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      
      setInterimTranscript(interim);
      if (final) {
        setEditedText(prev => prev + ' ' + final);
        setInterimTranscript('');
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
      setError('Voice recognition error: ' + event.error);
    };

    return () => {
      if (recognition) {
        recognition.stop();
      }
    };
  }, []);

  useEffect(() => {
    loadFromHistory();
  }, []);

  useEffect(() => {
    setShowTextLimitWarning(extractedText.length > 5000 || (isEditing && editedText.length > 5000));
  }, [extractedText, editedText, isEditing]);

  // Image upload handling
  const onDrop = useCallback((acceptedFiles) => {
    setError('');
    const file = acceptedFiles[0];
    if (file && file.type.match('image.*')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImage(e.target.result);
      };
      reader.readAsDataURL(file);
    } else {
      setError('Please upload an image file.');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: 'image/*',
    maxFiles: 1,
  });

  // Text extraction
  const extractText = async () => {
    if (!image) {
      setError('Please upload an image first.');
      return;
    }

    setLoading(true);
    setError('');
    setIsEditing(false);
    setEditedText('');
    
    try {
      const result = await Tesseract.recognize(
        image,
        'eng+spa+fra+deu+ita+por+rus+chi_sim+jpn+ara',
        { logger: m => console.log(m) }
      );
      setExtractedText(result.data.text);
    } catch (err) {
      setError('Error extracting text. Please try another image.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Text editing functions
  const handleEditText = () => {
    setEditedText(extractedText);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    setExtractedText(editedText);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  // Translation functions
  const detectLanguage = async (text) => {
    try {
      const response = await axios.post('https://libretranslate.de/detect', {
        q: text,
      });
      return response.data[0].language;
    } catch (err) {
      console.error('Language detection failed:', err);
      return 'en';
    }
  };

  const translateWithLibreTranslate = async (text, targetLang, sourceLang = 'auto') => {
    try {
      const response = await axios.post('https://libretranslate.de/translate', {
        q: text,
        source: sourceLang,
        target: targetLang,
      });
      return response.data.translatedText;
    } catch (err) {
      console.error('LibreTranslate error:', err);
      setApiStatus(prev => ({ ...prev, libretranslate: false }));
      throw err;
    }
  };

  const translateWithMyMemory = async (text, targetLang, sourceLang = 'en') => {
    try {
      const response = await axios.get('https://api.mymemory.translated.net/get', {
        params: {
          q: text,
          langpair: `${sourceLang}|${targetLang}`,
        }
      });
      
      if (response.data.responseStatus === 403) {
        throw new Error('Invalid language pair');
      }
      
      return response.data.responseData.translatedText;
    } catch (err) {
      console.error('MyMemory error:', err);
      setApiStatus(prev => ({ ...prev, mymemory: false }));
      throw err;
    }
  };

  const translateWithGoogle = async (text, targetLang, sourceLang = 'en') => {
    try {
      const response = await axios.post('https://translation.googleapis.com/language/translate/v2', {
        q: text,
        target: targetLang,
        source: sourceLang,
        key: 'YOUR_GOOGLE_API_KEY',
      });
      return response.data.data.translations[0].translatedText;
    } catch (err) {
      console.error('Google Translate error:', err);
      setApiStatus(prev => ({ ...prev, google: false }));
      throw err;
    }
  };

  const translateWithAzure = async (text, targetLang, sourceLang = 'en') => {
    try {
      const response = await axios.post(
        'https://api.cognitive.microsofttranslator.com/translate',
        [{ Text: text }],
        {
          params: {
            'api-version': '3.0',
            to: targetLang,
            from: sourceLang,
          },
          headers: {
            'Ocp-Apim-Subscription-Key': 'YOUR_AZURE_KEY',
            'Ocp-Apim-Subscription-Region': 'YOUR_REGION',
          },
        }
      );
      return response.data[0].translations[0].text;
    } catch (err) {
      console.error('Azure error:', err);
      setApiStatus(prev => ({ ...prev, azure: false }));
      throw err;
    }
  };

  const translateWithDeepL = async (text, targetLang, sourceLang = 'en') => {
    try {
      const response = await axios.post(
        'https://api-free.deepl.com/v2/translate',
        new URLSearchParams({
          text: text,
          target_lang: targetLang.toUpperCase(),
          source_lang: sourceLang.toUpperCase(),
        }),
        {
          headers: {
            'Authorization': 'DeepL-Auth-Key YOUR_DEEPL_KEY',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
      return response.data.translations[0].text;
    } catch (err) {
      console.error('DeepL error:', err);
      setApiStatus(prev => ({ ...prev, deepl: false }));
      throw err;
    }
  };

  const translateText = async () => {
    if (!extractedText.trim()) {
      setError('No text to translate. Please extract text first.');
      return;
    }

    setLoading(true);
    setError('');
    setTranslatedText('');

    try {
      const detectedLang = await detectLanguage(extractedText);
      console.log('Detected language:', detectedLang);

      const availableApis = apiProviders.filter(provider => apiStatus[provider.id]);
      if (availableApis.length === 0) {
        setError('All translation services are currently unavailable. Please try again later.');
        return;
      }

      let translationAttempts = [];
      if (apiStatus.libretranslate) {
        translationAttempts.push(() => translateWithLibreTranslate(extractedText, targetLanguage, detectedLang));
      }
      if (apiStatus.mymemory) {
        translationAttempts.push(() => translateWithMyMemory(extractedText, targetLanguage, detectedLang));
      }
      if (apiStatus.google) {
        translationAttempts.push(() => translateWithGoogle(extractedText, targetLanguage, detectedLang));
      }
      if (apiStatus.azure) {
        translationAttempts.push(() => translateWithAzure(extractedText, targetLanguage, detectedLang));
      }
      if (apiStatus.deepl) {
        translationAttempts.push(() => translateWithDeepL(extractedText, targetLanguage, detectedLang));
      }

      for (let attempt of translationAttempts) {
        try {
          const result = await attempt();
          setTranslatedText(result);
          setError('');
          saveToHistory(result, detectedLang);
          break;
        } catch (err) {
          console.error('Translation attempt failed:', err);
        }
      }

      if (!translatedText) {
        setError('Translation failed with all available services. Please try again later.');
      }
    } catch (err) {
      console.error('Translation error:', err);
      setError('Translation failed. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // History functions
  const saveToHistory = (translation, detectedLang) => {
    if (!extractedText || !translation) return;
    
    const newItem = {
      id: Date.now(),
      originalText: extractedText,
      translatedText: translation,
      fromLanguage: detectedLang || 'auto',
      toLanguage: targetLanguage,
      date: new Date().toISOString(),
      image: image
    };
    
    const updatedHistory = [newItem, ...history.slice(0, 9)];
    setHistory(updatedHistory);
    localStorage.setItem('translationHistory', JSON.stringify(updatedHistory));
  };

  const loadFromHistory = () => {
    const savedHistory = localStorage.getItem('translationHistory');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  };

  // Text-to-speech
  const speakText = (text, lang) => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    if (!('speechSynthesis' in window)) {
      setError('Text-to-speech is not supported in your browser.');
      return;
    }

    setIsSpeaking(true);
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    
    utterance.onend = utterance.onerror = () => {
      setIsSpeaking(false);
    };

    utterance.onerror = (event) => {
      console.error('SpeechSynthesis error:', event);
      setError('Error occurred during speech synthesis.');
    };

    setTimeout(() => {
      try {
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.error('Error speaking text:', err);
        setError('Failed to speak text. Please try again.');
        setIsSpeaking(false);
      }
    }, 100);
  };

  // Utility functions
  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
  };

  const clearAll = () => {
    setImage(null);
    setExtractedText('');
    setTranslatedText('');
    setError('');
    setIsEditing(false);
  };

  const toggleColorMode = () => {
    setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
  };

  // New function for camera capture
  const captureImage = useCallback(() => {
    if (!webcamRef.current) return;
    
    setIsCapturing(true);
    const imageSrc = webcamRef.current.getScreenshot();
    setImage(imageSrc);
    setIsCapturing(false);
    setShowCamera(false);
  }, [webcamRef]);

  // New function for voice typing toggle
  const toggleVoiceTyping = () => {
    if (!recognition) {
      setError('Speech recognition not supported in your browser');
      return;
    }
    
    if (isListening) {
      recognition.stop();
      setIsListening(false);
      setInterimTranscript('');
    } else {
      recognition.start();
      setIsListening(true);
    }
  };

  // History panel component
  const HistoryPanel = () => (
    <Paper elevation={3} sx={{ p: 2, mt: 2 }}>
      <Typography variant="h6" gutterBottom>Recent Translations</Typography>
      {history.length === 0 ? (
        <Typography variant="body2" color="textSecondary">No history yet</Typography>
      ) : (
        <Box sx={{ maxHeight: '300px', overflow: 'auto' }}>
          {history.map((item) => (
            <Paper key={item.id} sx={{ p: 2, mb: 1 }}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                {item.image && (
                  <img 
                    src={item.image} 
                    alt="History preview" 
                    style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px' }} 
                  />
                )}
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ mb: 1 }}>{item.originalText.slice(0, 50)}...</Typography>
                  <Typography variant="body2" color="primary">{item.translatedText.slice(0, 50)}...</Typography>
                  <Typography variant="caption" color="textSecondary">
                    {new Date(item.date).toLocaleString()} • {languages.find(l => l.code === item.toLanguage)?.name}
                  </Typography>
                </Box>
                <Button size="small" onClick={() => {
                  setImage(item.image);
                  setExtractedText(item.originalText);
                  setTranslatedText(item.translatedText);
                  setTargetLanguage(item.toLanguage);
                  setShowHistory(false);
                }}>
                  Load
                </Button>
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Paper>
  );

  // Modified TextField in the editing section to include voice typing
  const renderEditingField = () => (
    <Box sx={{ position: 'relative' }}>
      <TextField
        multiline
        fullWidth
        rows={8}
        variant="outlined"
        value={editedText}
        onChange={(e) => setEditedText(e.target.value)}
        autoFocus
        sx={{ 
          backgroundColor: theme.palette.mode === 'dark' ? '#333' : '#fff',
          '& .MuiOutlinedInput-root': {
            '& fieldset': {
              borderColor: theme.palette.mode === 'dark' ? '#555' : '#ccc',
            },
          }
        }}
      />
      <IconButton
        onClick={toggleVoiceTyping}
        sx={{
          position: 'absolute',
          right: 8,
          bottom: 8,
          backgroundColor: isListening ? 'error.main' : 'background.default',
          '&:hover': {
            backgroundColor: isListening ? 'error.dark' : 'background.paper',
          }
        }}
      >
        {isListening ? <Stop /> : <Mic />}
      </IconButton>
      {interimTranscript && (
        <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
          Listening: {interimTranscript}
        </Typography>
      )}
    </Box>
  );

  // Camera Dialog component
  const CameraDialog = () => (
    <Dialog open={showCamera} onClose={() => setShowCamera(false)} maxWidth="md">
      <DialogTitle>Capture Text from Camera</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={{ facingMode: 'environment' }}
            style={{ width: '100%', maxHeight: '60vh', borderRadius: '8px' }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setShowCamera(false)}>Cancel</Button>
        <Button 
          onClick={captureImage} 
          variant="contained" 
          color="primary"
          disabled={isCapturing}
          startIcon={isCapturing ? <CircularProgress size={20} /> : <CameraAlt />}
        >
          {isCapturing ? 'Capturing...' : 'Capture'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  // Modified upload section to include camera option
  const renderUploadSection = () => (
    <Paper elevation={3} sx={{ p: 3, mb: 4, borderRadius: 2 }}>
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<Videocam />}
          onClick={() => setShowCamera(true)}
          fullWidth
        >
          Use Camera
        </Button>
        <div {...getRootProps()} style={{ flex: 1 }}>
          <input {...getInputProps()} />
          <Button
            variant="outlined"
            startIcon={<CloudUpload />}
            fullWidth
            style={{ height: '100%' }}
          >
            Upload Image
          </Button>
        </div>
      </Box>
      
      <Typography variant="body2" color="textSecondary" sx={{ textAlign: 'center', mt: 1 }}>
        {isDragActive ? 'Drop the image here' : 'Drag & drop an image or use your camera'}
      </Typography>
      
      {image && (
        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Typography variant="subtitle1" gutterBottom>Preview:</Typography>
          <img 
            src={image} 
            alt="Uploaded preview" 
            style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '4px' }} 
          />
        </Box>
      )}
    </Paper>
  );

  // Main render
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h3" component="h1" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
            <Translate sx={{ verticalAlign: 'middle', mr: 1 }} />
            Image Text Translator
          </Typography>
          <Box>
            <IconButton onClick={() => setShowHistory(!showHistory)} color="inherit" sx={{ mr: 1 }}>
              <History />
            </IconButton>
            <IconButton onClick={toggleColorMode} color="inherit">
              {mode === 'dark' ? <Brightness7 /> : <Brightness4 />}
            </IconButton>
          </Box>
        </Box>
        
        {renderUploadSection()}
        <CameraDialog />

        {error && (
          <Typography color="error" sx={{ mb: 2, textAlign: 'center' }}>
            {error}
          </Typography>
        )}

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, mb: 4, alignItems: 'center' }}>
          <Button 
            variant="contained" 
            onClick={extractText} 
            disabled={!image || loading}
            startIcon={loading && !extractedText ? <CircularProgress size={20} color="inherit" /> : null}
            sx={{ flex: { xs: 1, md: 'none' } }}
          >
            Extract Text
          </Button>
          
          <FormControl sx={{ minWidth: 120, flex: { xs: 1, md: 'none' } }}>
            <InputLabel>Language</InputLabel>
            <Select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              label="Language"
            >
              {languages.map((lang) => (
                <MenuItem key={lang.code} value={lang.code}>
                  {lang.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <FormControl sx={{ minWidth: 140, flex: { xs: 1, md: 'none' } }}>
            <InputLabel>API Provider</InputLabel>
            <Select
              value={apiProvider}
              onChange={(e) => setApiProvider(e.target.value)}
              label="API Provider"
            >
              {apiProviders.map((provider) => (
                <MenuItem 
                  key={provider.id} 
                  value={provider.id}
                  disabled={!apiStatus[provider.id]}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {provider.name}
                    {provider.free && (
                      <Tooltip title="Free service (may have limits)">
                        <Info sx={{ fontSize: 16, ml: 1, color: 'text.secondary' }} />
                      </Tooltip>
                    )}
                    {!apiStatus[provider.id] && (
                      <Typography variant="caption" color="error" sx={{ ml: 1 }}>
                        (Unavailable)
                      </Typography>
                    )}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <Button 
            variant="contained" 
            color="secondary" 
            onClick={translateText} 
            disabled={!extractedText || loading}
            startIcon={loading && extractedText ? <CircularProgress size={20} color="inherit" /> : null}
            endIcon={<SwapHoriz />}
            sx={{ flex: { xs: 1, md: 'none' } }}
          >
            Translate
          </Button>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}>
          {extractedText && (
            <Paper elevation={2} sx={{ p: 3, flex: 1, borderRadius: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" component="h2">
                  Extracted Text ({extractedText.length} chars)
                </Typography>
                <Box>
                  {isEditing ? (
                    <>
                      <Button size="small" onClick={handleSaveEdit} sx={{ mr: 1 }}>Save</Button>
                      <Button size="small" onClick={handleCancelEdit}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      <Button size="small" onClick={handleEditText} sx={{ mr: 1 }}>Edit</Button>
                      <Button size="small" onClick={() => handleCopy(extractedText)} sx={{ mr: 1 }}>Copy</Button>
                      <IconButton onClick={clearAll} size="small">
                        <Clear />
                      </IconButton>
                    </>
                  )}
                </Box>
              </Box>
              
              {isEditing ? (
                renderEditingField()
              ) : (
                <TextField
                  multiline
                  fullWidth
                  rows={8}
                  variant="outlined"
                  value={extractedText}
                  InputProps={{ readOnly: true }}
                />
              )}
              
              {showTextLimitWarning && (
                <Typography color="warning.main" sx={{ mt: 1 }}>
                  Warning: Long texts may exceed API limits. Consider splitting the text.
                </Typography>
              )}
            </Paper>
          )}
          
          {translatedText && (
            <Paper elevation={2} sx={{ p: 3, flex: 1, borderRadius: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" component="h2">Translated Text</Typography>
                <Box>
                  <Button size="small" onClick={() => handleCopy(translatedText)} sx={{ mr: 1 }}>Copy</Button>
                  <IconButton 
                    onClick={() => speakText(translatedText, targetLanguage)} 
                    size="small"
                    color={isSpeaking ? 'primary' : 'default'}
                  >
                    <VolumeUp className={isSpeaking ? 'speaking' : ''} />
                  </IconButton>
                </Box>
              </Box>
              <TextField
                multiline
                fullWidth
                rows={8}
                variant="outlined"
                value={translatedText}
                InputProps={{ readOnly: true }}
              />
            </Paper>
          )}
        </Box>

        {showHistory && <HistoryPanel />}
      </Container>
    </ThemeProvider>
  );
}

export default App;
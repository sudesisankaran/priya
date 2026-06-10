import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import './index.css';

const STIMULI = [
  { id: 'red-cube', name: 'Red Cube', className: 'shape-red-cube' },
  { id: 'blue-sphere', name: 'Blue Sphere', className: 'shape-blue-sphere' },
  { id: 'green-cube', name: 'Green Cube', className: 'shape-green-cube' }
];

const POSITIONS = ['Left', 'Center', 'Right'];

function App() {
  const [appState, setAppState] = useState('INSTRUCTIONS'); // INSTRUCTIONS, FIXATION, STIMULUS, RESULT
  const [trialData, setTrialData] = useState([]);
  const [currentTrial, setCurrentTrial] = useState(1);
  const [stimulusInfo, setStimulusInfo] = useState(null);
  const [resultInfo, setResultInfo] = useState(null);
  const [isFaceTrackingReady, setIsFaceTrackingReady] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const stimulusStartTimeRef = useRef(0);
  const requestRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);

  // Initialize MediaPipe Face Landmarker
  useEffect(() => {
    async function initMediaPipe() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1
        });
        faceLandmarkerRef.current = faceLandmarker;

        // Start webcam
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.addEventListener('loadeddata', () => {
              setIsFaceTrackingReady(true);
              predictWebcam();
            });
          }
        }
      } catch (error) {
        console.error("Error initializing MediaPipe:", error);
      }
    }
    initMediaPipe();

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const predictWebcam = () => {
    if (!videoRef.current || !faceLandmarkerRef.current) return;
    
    const startTimeMs = performance.now();
    if (lastVideoTimeRef.current !== videoRef.current.currentTime) {
      lastVideoTimeRef.current = videoRef.current.currentTime;
      const results = faceLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);
      
      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        drawFaceMesh(results.faceLandmarks[0]);
      } else {
        clearCanvas();
      }
    }
    
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  const drawFaceMesh = (landmarks) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#00FF00';
    // Draw simple dots for eyes and face outline
    landmarks.forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x * canvas.width, point.y * canvas.height, 1, 0, 2 * Math.PI);
      ctx.fill();
    });
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const startTrial = useCallback(() => {
    setAppState('FIXATION');
    
    // Show fixation cross for 1000-2500ms
    const fixationTime = 1000 + Math.random() * 1500;
    setTimeout(() => {
      const randomStimulus = STIMULI[Math.floor(Math.random() * STIMULI.length)];
      const randomPosition = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
      setStimulusInfo({ ...randomStimulus, position: randomPosition });
      setAppState('STIMULUS');
      stimulusStartTimeRef.current = performance.now();
    }, fixationTime);
  }, []);

  // Handle keypresses for starting and responding
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        e.preventDefault(); // Prevent page scrolling
        if (appState === 'INSTRUCTIONS') {
          startTrial();
        } else if (appState === 'STIMULUS') {
          const endTime = performance.now();
          const reactionTime = ((endTime - stimulusStartTimeRef.current) / 1000).toFixed(3);
          
          const newResult = {
            trial: currentTrial,
            stimulus: stimulusInfo.name,
            position: stimulusInfo.position,
            reactionTime: reactionTime,
          };
          
          setResultInfo(newResult);
          setTrialData(prev => [...prev, newResult]);
          setAppState('RESULT');
        } else if (appState === 'RESULT') {
          setCurrentTrial(prev => prev + 1);
          startTrial();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appState, startTrial, currentTrial, stimulusInfo]);

  const downloadCSV = () => {
    const headers = ['Trial', 'Stimulus', 'Position', 'RT (s)'];
    const rows = trialData.map(row => [row.trial, row.stimulus, row.position, row.reactionTime]);
    
    let csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "vrt_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper for determining absolute position classes
  const getPositionClasses = (position) => {
    switch (position) {
      case 'Left': return 'left-[15%] top-1/2 -translate-y-1/2';
      case 'Right': return 'right-[15%] top-1/2 -translate-y-1/2';
      case 'Center': default: return 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2';
    }
  };

  return (
    <div className="flex flex-col lg:flex-row w-full h-[100dvh] bg-neutral-900 text-white font-sans overflow-hidden">
      
      {/* LEFT: Testing Area */}
      <div className="w-full h-1/2 lg:h-full lg:flex-1 flex justify-center items-center relative lg:border-r border-b lg:border-b-0 border-neutral-700 overflow-hidden shrink-0">
        
        {appState === 'INSTRUCTIONS' && (
          <div className="w-full h-full flex flex-col justify-center p-6 md:p-12 bg-black font-mono text-green-500 overflow-y-auto">
            <h2 className="text-2xl md:text-3xl mb-4 md:mb-6">WELCOME TO VRT TEST.</h2>
            <p className="text-base md:text-xl mb-2">Look at the fixation cross (+).</p>
            <p className="text-base md:text-xl mb-2">3D image will appear randomly.</p>
            <p className="text-base md:text-xl mb-6 md:mb-8">Press SPACE as soon as you see it.</p>
            <p className="text-base md:text-xl animate-pulse">Press SPACE to Start...</p>
          </div>
        )}

        {appState === 'FIXATION' && (
          <div className="w-full h-full flex justify-center items-center bg-white text-black">
            <div className="text-6xl md:text-8xl font-bold">+</div>
          </div>
        )}

        {appState === 'STIMULUS' && stimulusInfo && (
          <div className="w-full h-full bg-white relative">
            <div className={`absolute shape ${stimulusInfo.className} ${getPositionClasses(stimulusInfo.position)} scale-50 md:scale-100`}></div>
          </div>
        )}

        {appState === 'RESULT' && resultInfo && (
          <div className="w-full h-full flex flex-col justify-center p-6 md:p-12 bg-black font-mono text-green-500 overflow-y-auto">
            <h2 className="text-2xl md:text-3xl mb-4 text-green-400">Reaction Time: {resultInfo.reactionTime} sec</h2>
            <div className="text-base md:text-xl mb-2">Trial: {resultInfo.trial}</div>
            <div className="text-base md:text-xl mb-2">Stimulus Type: {resultInfo.stimulus}</div>
            <div className="text-base md:text-xl mb-6 md:mb-8">Position: {resultInfo.position}</div>
            <p className="text-base md:text-xl animate-pulse text-green-300">Press SPACE to Continue...</p>
          </div>
        )}

      </div>

      {/* RIGHT: Webcam & Data Area */}
      <div className="w-full h-1/2 lg:w-[400px] lg:h-full flex flex-col bg-neutral-800 shadow-xl z-10 shrink-0">
        
        <div className="p-4 border-b border-neutral-700 bg-neutral-900">
          <h1 className="text-lg font-bold">VRT & Eye Tracking</h1>
          <div className="text-sm text-neutral-400 flex items-center mt-1">
            <div className={`w-2 h-2 rounded-full mr-2 ${isFaceTrackingReady ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-yellow-500 animate-pulse'}`}></div>
            {isFaceTrackingReady ? 'Eye Tracking Active' : 'Initializing Camera...'}
          </div>
        </div>

        {/* Webcam Area */}
        <div className="p-4 border-b border-neutral-700">
          <h3 className="text-sm uppercase tracking-wider text-neutral-400 mb-2 font-semibold">Live Feed</h3>
          <div className="relative w-full aspect-video bg-black rounded overflow-hidden">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
            />
            <canvas 
              ref={canvasRef} 
              className="absolute inset-0 w-full h-full transform -scale-x-100 pointer-events-none"
            />
            {!isFaceTrackingReady && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
                Loading model...
              </div>
            )}
          </div>
        </div>

        {/* Data Area */}
        <div className="flex-1 p-4 flex flex-col min-h-0">
          <h3 className="text-sm uppercase tracking-wider text-neutral-400 mb-2 font-semibold">Trial Data</h3>
          
          <div className="flex-1 bg-neutral-900 rounded overflow-hidden flex flex-col min-h-0 border border-neutral-700">
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-neutral-950 text-neutral-400 sticky top-0 shadow-sm z-10">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Trial</th>
                    <th className="py-2 px-3 font-semibold">Stimulus</th>
                    <th className="py-2 px-3 font-semibold">Pos</th>
                    <th className="py-2 px-3 font-semibold">RT (s)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {trialData.map((row, i) => (
                    <tr key={i} className="hover:bg-neutral-800/50">
                      <td className="py-2 px-3">{row.trial}</td>
                      <td className="py-2 px-3">{row.stimulus}</td>
                      <td className="py-2 px-3">{row.position}</td>
                      <td className="py-2 px-3 font-mono text-green-400">{row.reactionTime}</td>
                    </tr>
                  ))}
                  {trialData.length === 0 && (
                    <tr>
                      <td colSpan="4" className="py-8 text-center text-neutral-500">No trials recorded yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <button 
            onClick={downloadCSV}
            disabled={trialData.length === 0}
            className="mt-4 w-full py-2 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded font-medium transition-colors"
          >
            Download CSV
          </button>
        </div>

      </div>

    </div>
  );
}

export default App;

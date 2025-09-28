import React, { useState, useEffect, useRef } from "react";
import "./App.css";

const SHEET_ID = '1qZ3U2WMlvwOyjn7yVe0fLLmk39jbSsIk_bFk5TJhlnA';
const GID = '955471057';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
const CORS_PROXIES = [
  'https://corsproxy.io/?',
  'https://cors-anywhere.herokuapp.com/',
  'https://api.codetabs.com/v1/proxy?quest=',
  'https://thingproxy.freeboard.io/fetch/'
];

function parseCSV(text) {
  const rows = [];
  const lines = text.split('\n');
  for (let line of lines) {
    const row = [];
    let currentField = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(currentField);
        currentField = '';
      } else {
        currentField += char;
      }
    }
    row.push(currentField);
    rows.push(row);
  }
  return rows;
}

function getFirstColumnValues(csvText) {
  const rows = parseCSV(csvText);
  let lastNonEmptyIndex = -1;
  const firstColumnValues = rows.map((row, index) => {
    const value = row[0] ? row[0].trim() : '';
    if (value) lastNonEmptyIndex = index;
    return value;
  });
  return firstColumnValues.slice(0, lastNonEmptyIndex + 1);
}

function App() {
  const [data, setData] = useState([]);
  const [csvText, setCsvText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [manualEditDone, setManualEditDone] = useState(false);
  const [autoRefreshStopped, setAutoRefreshStopped] = useState(false);
  const [fontSize, setFontSize] = useState(60);

  const dataContainerRef = useRef(null);
  const editTextareaRef = useRef(null);
  const refreshIntervalRef = useRef(null);

  const loadData = async () => {
    setLoading(true);
    setError("");
    if (isEditMode || manualEditDone) {
      setLoading(false);
      return;
    }
    let csv = null;
    let lastError = null;
    for (const method of ['direct', ...CORS_PROXIES]) {
      try {
        let response;
        if (method === 'direct') {
          response = await fetch(CSV_URL, { mode: 'no-cors' });
          continue;
        } else {
          const proxyUrl = method + encodeURIComponent(CSV_URL);
          response = await fetch(proxyUrl);
        }
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const responseText = await response.text();
        try {
          const jsonData = JSON.parse(responseText);
          csv = jsonData.contents || jsonData.data || responseText;
        } catch {
          csv = responseText;
        }
        if (csv && (csv.includes(',') || csv.includes('\n'))) break;
      } catch (error) {
        lastError = error;
        continue;
      }
    }
    if (!csv) {
      setError("Tietojen lataus epäonnistui.");
      setLoading(false);
      return;
    }
    setCsvText(csv);
    const values = getFirstColumnValues(csv);
    setData(values.length ? values : ["Ei tietoja saatavilla"]);
    setLoading(false);
  };

  const adjustFontToFit = () => {
    if (!dataContainerRef.current) return;
    const items = data.length;
    if (!items) return;
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;
    const isPortrait = windowHeight > windowWidth;
    let size;
    if (isPortrait) {
      const heightBased = Math.floor(windowHeight / (items * 1.5));
      const widthBased = Math.floor(windowWidth * 0.18);
      size = Math.min(heightBased, widthBased);
    } else {
      const heightBased = Math.floor(windowHeight / (items * 1.5));
      const widthBased = Math.floor(windowWidth * 0.15);
      size = Math.min(heightBased, widthBased);
    }
    if (items <= 3) size = Math.max(size, 60);
    else if (items <= 6) size = Math.max(size, 40);
    else size = Math.max(size, 30);
    size = Math.min(size, 120);
    setFontSize(size);
  };

  useEffect(() => {
    loadData();
    adjustFontToFit();
    refreshIntervalRef.current = setInterval(() => {
      if (!isEditMode && !manualEditDone) loadData();
    }, 15000);
    window.addEventListener("resize", adjustFontToFit);
    return () => {
      clearInterval(refreshIntervalRef.current);
      window.removeEventListener("resize", adjustFontToFit);
    };
  }, []);

  useEffect(() => {
    adjustFontToFit();
  }, [data]);

  useEffect(() => {
    let bufferedKey = null;
    let editModeActivatedAt = 0;
    let ignoreInputTimeout = null;

    const handler = (e) => {
      if (e.key === "F2" && !isEditMode) {
        setEditValue(data.join("\n"));
        setIsEditMode(true);
        editModeActivatedAt = Date.now();
        setTimeout(() => editTextareaRef.current && editTextareaRef.current.focus(), 100);
      } else if (isEditMode) {
        if (Date.now() - editModeActivatedAt < 200) {
          if (!bufferedKey && e.key.length === 1) {
            bufferedKey = e.key;
          }
          e.preventDefault();
          ignoreInputTimeout = setTimeout(() => {
            if (bufferedKey && editTextareaRef.current) {
              const textarea = editTextareaRef.current;
              const pos = textarea.selectionStart;
              const before = textarea.value.slice(0, pos);
              const after = textarea.value.slice(pos);
              textarea.value = before + bufferedKey + after;
              textarea.selectionStart = textarea.selectionEnd = pos + bufferedKey.length;
              setEditValue(textarea.value);
              bufferedKey = null;
            }
          }, 200);
          return;
        }
        if (e.key === "Escape") {
          setIsEditMode(false);
        } else if (e.key === "F4") {
          e.preventDefault();
          setIsEditMode(false);
          setManualEditDone(true);
          setData(editValue.split("\n"));
          setAutoRefreshStopped(true);
          clearInterval(refreshIntervalRef.current);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isEditMode, editValue, data]);

  useEffect(() => {
    if (!isEditMode) return;
    const blurHandler = () => {
      setIsEditMode(false);
      setManualEditDone(true);
      setData(editValue.split("\n"));
      setAutoRefreshStopped(true);
      clearInterval(refreshIntervalRef.current);
    };
    const textarea = editTextareaRef.current;
    if (textarea) textarea.addEventListener("blur", blurHandler);
    return () => {
      if (textarea) textarea.removeEventListener("blur", blurHandler);
    };
  }, [isEditMode, editValue]);

  useEffect(() => {
    let cursorTimeout;
    function showCursor() {
      document.body.style.cursor = '';
    }
    function hideCursor() {
      document.body.style.cursor = 'none';
    }
    function resetCursorTimeout() {
      showCursor();
      if (cursorTimeout) clearTimeout(cursorTimeout);
      cursorTimeout = setTimeout(hideCursor, 3000);
    }
    window.addEventListener('mousemove', resetCursorTimeout);
    window.addEventListener('mousedown', resetCursorTimeout);
    window.addEventListener('keydown', resetCursorTimeout);
    resetCursorTimeout();
    return () => {
      window.removeEventListener('mousemove', resetCursorTimeout);
      window.removeEventListener('mousedown', resetCursorTimeout);
      window.removeEventListener('keydown', resetCursorTimeout);
      if (cursorTimeout) clearTimeout(cursorTimeout);
    };
  }, []);

  useEffect(() => {
    function handleFullscreen() {
      setTimeout(adjustFontToFit, 300);
    }
    document.addEventListener('fullscreenchange', handleFullscreen);
    document.addEventListener('webkitfullscreenchange', handleFullscreen);
    document.addEventListener('mozfullscreenchange', handleFullscreen);
    document.addEventListener('MSFullscreenChange', handleFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreen);
      document.removeEventListener('webkitfullscreenchange', handleFullscreen);
      document.removeEventListener('mozfullscreenchange', handleFullscreen);
      document.removeEventListener('MSFullscreenChange', handleFullscreen);
    };
  }, []);

  return (
    <div className="app-root">
      <div
        className="data-container"
        ref={dataContainerRef}
        style={{ display: isEditMode ? "none" : "block" }}
      >
        {data.map((item, idx) => (
          <div
            className="data-item has-content"
            key={idx}
            style={{ fontSize: fontSize + "px" }}
          >
            {item || " "}
          </div>
        ))}
      </div>
      <textarea

        className={`edit-textarea${isEditMode ? " zoomed" : ""}`}
        ref={editTextareaRef}
        style={{ display: isEditMode ? "block" : "none", fontSize: fontSize + "px" }}
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
      />
      {error && <div className="error">{error}</div>}
    </div>
  );
}

export default App;

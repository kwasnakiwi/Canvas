import { useEffect, useRef, useState } from 'react';
import './App.css';

/* =========================================================================
   Stałe siatki i przyciągania
   ========================================================================= */
const GRID_SIZE = 100;
const SNAP_THRESHOLD = 7;
/* =========================================================================
   Przyciąganie – dokładny offset do najbliższej linii
   ========================================================================= */
const snapOffset = v => {
  // normalizujemy resztę, żeby ZAWSZE była w zakresie 0‥GRID_SIZE-1
  const mod = ((v % GRID_SIZE) + GRID_SIZE) % GRID_SIZE;

  if (mod <= SNAP_THRESHOLD)                 return -mod;              // w lewo / w górę
  if (GRID_SIZE - mod <= SNAP_THRESHOLD)     return  GRID_SIZE - mod;  // w prawo / w dół
  return 0;                                  // nic do przyciągania
};


const getSnapDelta = (...edges) => {
  let best = 0;
  for (const e of edges) {
    const d = snapOffset(e);
    if (d && (best === 0 || Math.abs(d) < Math.abs(best))) best = d;   // wybieramy NAJBLIŻSZY
  }
  return best;            // 0, jeżeli żaden brzeg nie „łapie”
};
              // zwraca 0 gdy nic nie „łapie”


/* =========================================================================
   Klasy figur (koło, prostokąt, kwadrat)
   ========================================================================= */
class Circle {
  constructor(x, y, radius, color, borderColor) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.color = color;
    this.borderColor = borderColor;
  }
  draw(ctx) {
    ctx.beginPath();
    ctx.fillStyle = this.color;
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = this.borderColor;
    ctx.stroke();
    ctx.closePath();
  }
  contains(px, py) {
    const dx = px - this.x,
      dy = py - this.y;
    return dx * dx + dy * dy <= this.radius * this.radius;
  }
}

class Rect {
  constructor(x, y, width, height, color, borderColor) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.color = color;
    this.borderColor = borderColor;
  }
  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.lineWidth = 8;
    ctx.strokeStyle = this.borderColor;
    ctx.strokeRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
    ctx.fillRect(
      this.x - this.width / 2,
      this.y - this.height / 2,
      this.width,
      this.height
    );
  }
  contains(px, py) {
    return (
      px >= this.x - this.width / 2 &&
      px <= this.x + this.width / 2 &&
      py >= this.y - this.height / 2 &&
      py <= this.y + this.height / 2
    );
  }
}

class Square extends Rect {
  constructor(x, y, size, color, borderColor) {
    super(x, y, size, size, color, borderColor);
  }
}
// zamiast dotychczasowych BASIC_COLORS:
const BASIC_COLORS = [
  "#ff0000", // czerwony
  "#00ff00", // zielony
  "#0000ff", // niebieski
  "#ffff00", // żółty
  "#ff00ff", // purpurowy (magenta)
  "#00ffff", // cyjan
  "#000000", // czarny
  "#ffffff", // biały
  "#808080", // szary
];

// Funkcja do przyciemniania koloru o podany procent (0–1)
const darkenColor = (hex, amount) => {
  const c = hex.replace('#','');
  let num = parseInt(c,16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  r = Math.floor(r * (1 - amount));
  g = Math.floor(g * (1 - amount));
  b = Math.floor(b * (1 - amount));
  return '#' + [r,g,b].map(x => x.toString(16).padStart(2,'0')).join('');
};

/* =========================================================================
   Główna aplikacja React
   ========================================================================= */
export default function App() {
  /* ---------- referencje & stany ---------- */
  const canvasRef = useRef(null);
  const [shape, setShape] = useState('');
  const [shapes, setShapes] = useState([]);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizingCorner, setResizingCorner] = useState(null);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const initialRef = useRef(null);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPan, setLastPan] = useState({ x: 0, y: 0 });
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pickerColor, setPickerColor] = useState(BASIC_COLORS[0]);
  // —————————————————————————————————————————————
// 1) Handlery panelu kolorów (add po wszystkich useState)
const saveColor = () => {
  if (selectedIndex == null) return;
  setShapes(prev => {
    const upd = [...prev];
    const s = upd[selectedIndex];
    s.color = pickerColor;
    s.borderColor = darkenColor(pickerColor, 0.2);
    return upd;
  });
  setShowColorPicker(false);
};

const cancelColor = () => {
  setShowColorPicker(false);
};
// —————————————————————————————————————————————


  /* ---------------------------------------------------------------------
     useEffect – cała logika rysowania + event‑handlery
     --------------------------------------------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    /* --- ustawienia rozdzielczości canvasu --- */
    canvas.width = 12000;
    canvas.height = 12000;
    canvas.style.backgroundColor = '#fff';

    /* ----------------------------------------
       Funkcja rysująca (siatka + figury)
       ---------------------------------------- */
    const drawAll = () => {
      ctx.setTransform(scale, 0, 0, scale, viewOffset.x, viewOffset.y);
      ctx.clearRect(
        -viewOffset.x / scale,
        -viewOffset.y / scale,
        canvas.width / scale,
        canvas.height / scale
      );

      /* -- siatka -- */
      const worldLeft = -viewOffset.x / scale;
      const worldTop = -viewOffset.y / scale;
      const worldRight = (canvas.width - viewOffset.x) / scale;
      const worldBottom = (canvas.height - viewOffset.y) / scale;

      ctx.strokeStyle = '#000';
      ctx.lineWidth = 0.5;

      for (
        let x = Math.floor(worldLeft / GRID_SIZE) * GRID_SIZE;
        x < worldRight;
        x += GRID_SIZE
      ) {
        ctx.beginPath();
        ctx.moveTo(x, worldTop);
        ctx.lineTo(x, worldBottom);
        ctx.stroke();
      }
      for (
        let y = Math.floor(worldTop / GRID_SIZE) * GRID_SIZE;
        y < worldBottom;
        y += GRID_SIZE
      ) {
        ctx.beginPath();
        ctx.moveTo(worldLeft, y);
        ctx.lineTo(worldRight, y);
        ctx.stroke();
      }

      /* -- figury + uchwyty wyboru -- */
      shapes.forEach((s, i) => {
        s.draw(ctx);

        if (i === selectedIndex) {
          const hs = 12; // wielkość uchwytu
          const handles = s instanceof Circle
            ? {
                tl: [s.x - s.radius, s.y - s.radius],
                tr: [s.x + s.radius, s.y - s.radius],
                bl: [s.x - s.radius, s.y + s.radius],
                br: [s.x + s.radius, s.y + s.radius],
              }
            : {
                tl: [s.x - s.width / 2, s.y - s.height / 2],
                tr: [s.x + s.width / 2, s.y - s.height / 2],
                bl: [s.x - s.width / 2, s.y + s.height / 2],
                br: [s.x + s.width / 2, s.y + s.height / 2],
              };

          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0); // reset do współrzędnych ekranu
          ctx.fillStyle = 'black';
          Object.values(handles).forEach(([hx, hy]) => {
            const sx = hx * scale + viewOffset.x;
            const sy = hy * scale + viewOffset.y;
            ctx.fillRect(sx - hs / 2, sy - hs / 2, hs, hs);
          });
          ctx.restore();
        }
      });
    };

    /* inicjalne rysowanie */
    drawAll();

    /* ------------------------------------------------------------------
       Pomocniczy hit‑test → indeks figury pod kursorem lub −1
       ------------------------------------------------------------------ */
   const hitTest = (mx, my) => {
  const wx = (mx - viewOffset.x) / scale;
  const wy = (my - viewOffset.y) / scale;

  return shapes.findLastIndex(s => s.contains(wx, wy));
};


    /* ------------------------------------------------------------------
       MOUSE‑DOWN  (start panning / resize / drag)
       ------------------------------------------------------------------ */
// MOUSE-DOWN  (start panning / resize / drag)
// obsługuje wyłącznie lewy przycisk
// MOUSE-DOWN  (start panning / resize / drag)
// → obsługuje WYŁĄCZNIE lewy przycisk (button 0)
// Wewnątrz Twojego useEffect, lub tam gdzie rejestrujesz listener’y:

// 1️⃣ – funkcja onMouseDown
// … w useEffect, zamiast dotychczasowego onMouseDown:
const onMouseDown = e => {
  const rect    = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;
  const worldX  = (screenX - viewOffset.x) / scale;
  const worldY  = (screenY - viewOffset.y) / scale;

  // ── PRAWY KLIK ── select/deselect + otwórz panel
  if (e.button === 2) {
    e.preventDefault();
    const idx = hitTest(screenX, screenY);
    setSelectedIndex(idx !== -1 ? idx : null);
    setShowColorPicker(idx !== -1);
    setIsResizing(false);
    return;
  }

  // ── LEWY KLIK ── drag / resize / pan (bez zmiany `selectedIndex`)
  if (e.button !== 0) return;  // ignoruj inne przyciski

  // jeśli klik w uchwyt → start resize
  if (selectedIndex != null && startResizeIfHitHandle(screenX, screenY, worldX, worldY)) {
    return;
  }

  // jeśli klik w kształt → drag
  const idx2 = hitTest(screenX, screenY);
  if (idx2 !== -1) {
    if (isDeleting) {
      setShapes(prev => prev.filter((_, i) => i !== idx2));
      setSelectedIndex(null);
      setShowColorPicker(false);
      return;
    }
    setDraggedIndex(idx2);
    setOffset({ x: worldX - shapes[idx2].x, y: worldY - shapes[idx2].y });
    setShowColorPicker(false);
    return;
  }

  // klik na tło → deselect + pan
  setSelectedIndex(null);
  setShowColorPicker(false);
  setIsPanning(true);
  setLastPan({ x: e.clientX, y: e.clientY });
};

// … w tej samej przestrzeni, pomocniczo:
function startResizeIfHitHandle(screenX, screenY, worldX, worldY) {
  const s  = shapes[selectedIndex];
  const hs = 12;
  const handles = s instanceof Circle
    ? { tl: [s.x - s.radius, s.y - s.radius], tr: [s.x + s.radius, s.y - s.radius],
        bl: [s.x - s.radius, s.y + s.radius], br: [s.x + s.radius, s.y + s.radius] }
    : { tl: [s.x - s.width/2, s.y - s.height/2], tr: [s.x + s.width/2, s.y - s.height/2],
        bl: [s.x - s.width/2, s.y + s.height/2], br: [s.x + s.width/2, s.y + s.height/2] };

  for (let key in handles) {
    const [hx, hy] = handles[key];
    const sx = hx * scale + viewOffset.x;
    const sy = hy * scale + viewOffset.y;
    if (
      screenX >= sx - hs/2 && screenX <= sx + hs/2 &&
      screenY >= sy - hs/2 && screenY <= sy + hs/2
    ) {
      setIsResizing(true);
      setResizingCorner(key);
      initialRef.current = {
        x: worldX,
        y: worldY,
        shape: JSON.parse(JSON.stringify(s)),
      };
      return true;
    }
  }
  return false;
}

// I pamiętaj przy rejestracji:
canvas.addEventListener('mousedown', onMouseDown);
canvas.addEventListener('contextmenu', e => e.preventDefault());




    /* ------------------------------------------------------------------
       MOUSE‑MOVE  (panning / resize / drag)
       ------------------------------------------------------------------ */
    const onMouseMove = e => {
  /* --- 1. Panning ma najwyższy priorytet --- */
  if (isPanning) {
    const dx = e.clientX - lastPan.x;
    const dy = e.clientY - lastPan.y;
    setViewOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    setLastPan({ x: e.clientX, y: e.clientY });
    return;                       // 👉 nic więcej w tej klatce
  }

  /* --- 2. Współrzędne myszy w układzie „światowym” --- */
  const rect = canvas.getBoundingClientRect();
  const mouseX = (e.clientX - rect.left - viewOffset.x) / scale;
  const mouseY = (e.clientY - rect.top  - viewOffset.y) / scale;

  /* --------------------------------------------------------------------
     A. RESIZE
     -------------------------------------------------------------------- */
  if (isResizing && selectedIndex != null &&
      resizingCorner && initialRef.current?.shape) {

    const original = JSON.parse(JSON.stringify(initialRef.current.shape));
    const startX = initialRef.current.x;
    const startY = initialRef.current.y;

    setShapes(prev => {
      const updated = [...prev];
      const shape   = updated[selectedIndex];

      /* ————————————  K O Ł O  ———————————— */
      if (shape instanceof Circle) {
        let fixedX, fixedY;
        const r  = original.radius;
        const cx = original.x;
        const cy = original.y;

        if (resizingCorner === 'tl') { fixedX = cx + r; fixedY = cy + r; }
        if (resizingCorner === 'tr') { fixedX = cx - r; fixedY = cy + r; }
        if (resizingCorner === 'bl') { fixedX = cx + r; fixedY = cy - r; }
        if (resizingCorner === 'br') { fixedX = cx - r; fixedY = cy - r; }

        const dx = mouseX - fixedX;
        const dy = mouseY - fixedY;
        const side = Math.min(Math.abs(dx), Math.abs(dy));      // kwadrat w cieniu koła
        const newRadius = Math.max(5, side / 2);

        /* przesuń środek tak, by „ciągnięty” brzeg został tam gdzie kursor */
        shape.x = fixedX + Math.sign(dx) * newRadius;
        shape.y = fixedY + Math.sign(dy) * newRadius;
        shape.radius = newRadius;

        /* przyciągnij: lewy/prawy + górny/dolny */
        const r2 = shape.radius;
        const left   = shape.x - r2, right  = shape.x + r2;
        const top    = shape.y - r2, bottom = shape.y + r2;

        shape.x += getSnapDelta(left,  right);
        shape.y += getSnapDelta(top,   bottom);

      /* ———————————  P R O S T O K Ą T  ——————————— */
      } else {
        let left, right, top, bottom;
        const ox = original.x;
        const oy = original.y;
        const ow = original.width;
        const oh = original.height;
        const dx = mouseX - startX;
        const dy = mouseY - startY;

        /* oblicz nowe krawędzie „ciągniętego” rogu */
        if (resizingCorner === 'tl')      { left = ox - ow/2 + dx;  top = oy - oh/2 + dy;  right = ox + ow/2;       bottom = oy + oh/2;      }
        else if (resizingCorner === 'tr') { left = ox - ow/2;       top = oy - oh/2 + dy;  right = ox + ow/2 + dx; bottom = oy + oh/2;      }
        else if (resizingCorner === 'bl') { left = ox - ow/2 + dx;  top = oy - oh/2;       right = ox + ow/2;      bottom = oy + oh/2 + dy; }
        else if (resizingCorner === 'br') { left = ox - ow/2;       top = oy - oh/2;       right = ox + ow/2 + dx; bottom = oy + oh/2 + dy; }

        /* ➡️ SNAP – tylko krawędzie, które faktycznie poruszasz */
        if (resizingCorner.includes('l')) left   += snapOffset(left);
        if (resizingCorner.includes('r')) right  += snapOffset(right);
        if (resizingCorner.includes('t')) top    += snapOffset(top);
        if (resizingCorner.includes('b')) bottom += snapOffset(bottom);

        /* finalnie aktualizuj figurę */
        shape.width  = Math.max(10, right  - left);
        shape.height = Math.max(10, bottom - top);
        shape.x = (left + right) / 2;
        shape.y = (top  + bottom) / 2;
      }

      return updated;
    });
    return;                         // nic więcej – koniec resize
  }

  /* --------------------------------------------------------------------
     B. DRAG FIGURY
     -------------------------------------------------------------------- */
  if (draggedIndex != null) {
    setShapes(prev => {
      const u     = [...prev];
      let   x     = mouseX - offset.x;
      let   y     = mouseY - offset.y;
      const shape = u[draggedIndex];

      if (shape instanceof Circle) {
        const r = shape.radius;
        const dx = getSnapDelta(x - r, x + r);
        const dy = getSnapDelta(y - r, y + r);
        x += dx;
        y += dy;
      } else {
        const halfW = shape.width  / 2;
        const halfH = shape.height / 2;
        const dx = getSnapDelta(x - halfW, x + halfW);
        const dy = getSnapDelta(y - halfH, y + halfH);
        x += dx;
        y += dy;
      }

      shape.x = x;
      shape.y = y;
      return u;
    });
  }
};


    /* ------------------------------------------------------------------
       MOUSE‑UP – kończy panning / drag / resize
       ------------------------------------------------------------------ */
    const onMouseUp = () => {
      setIsPanning(false);
      setDraggedIndex(null);
      setIsResizing(false);
      initialRef.current = null;
    };

    /* ------------------------------------------------------------------
       Dodatkowe eventy (contextmenu, scroll‑zoom, dblclick, klawisze)
       ------------------------------------------------------------------ */
    // CONTEXTMENU  (tylko prawe — zaznaczanie/deselekcja)
// CONTEXTMENU  (tylko prawy przycisk – zaznaczanie/deselekcja)
const onContext = e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;
  const idx = hitTest(screenX, screenY);
  setSelectedIndex(idx !== -1 ? idx : null);
  setIsResizing(false);
};



    const onWheel = e => {
      if (!e.ctrlKey) return;
      e.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomIntensity = 0.0015;
      const delta = -e.deltaY;
      const zoom = 1 + delta * zoomIntensity;
      const newScale = Math.max(0.1, Math.min(scale * zoom, 10));

      const worldX = (mouseX - viewOffset.x) / scale;
      const worldY = (mouseY - viewOffset.y) / scale;

      const newOffsetX = mouseX - worldX * newScale;
      const newOffsetY = mouseY - worldY * newScale;

      setScale(newScale);
      setViewOffset({ x: newOffsetX, y: newOffsetY });
    };

    const onDoubleClick = e => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - viewOffset.x) / scale;
      const y = (e.clientY - rect.top - viewOffset.y) / scale;
      let n = null;
      if (shape === 'circle') n = new Circle(x, y, 50, "#e0e0e0", "#9e9e9e");
      if (shape === 'rect') n = new Rect(x, y, 200, 100, "#e0e0e0", "#9e9e9e");
      if (shape === 'square') n = new Square(x, y, 100, "#e0e0e0", "#9e9e9e");
      if (n) {
        setShapes(prev => {
          const u = [...prev, n];
          setSelectedIndex(u.length - 1);
          return u;
        });
      }
    };

    const onKeyDown = e => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
      if (ctrlOrCmd && e.key === '0') {
        e.preventDefault();
        setScale(1);
        setViewOffset({ x: 0, y: 0 });
      }
    };

    /* ------------------------------------------------------------------
       Rejestracja listenerów
       ------------------------------------------------------------------ */
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', onContext);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDoubleClick);
    window.addEventListener('keydown', onKeyDown);

    /* ------------------------------------------------------------------
       Cleanup on unmount / dependency change
       ------------------------------------------------------------------ */
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('contextmenu', onContext);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDoubleClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    shape,
    shapes,
    draggedIndex,
    offset,
    isDeleting,
    selectedIndex,
    isResizing,
    resizingCorner,
    viewOffset,
    scale,
    isPanning,
    lastPan,
    showColorPicker,
    pickerColor
  ]);

  /* ---------------------------------------------------------------------
     JSX – przyciski + canvas
     --------------------------------------------------------------------- */
// w górze App(), przed return:
let panelStyle = {};
if (showColorPicker && selectedIndex != null) {
  const s = shapes[selectedIndex];
  const screenX = s.x * scale + viewOffset.x;
  const screenY = s.y * scale + viewOffset.y;
  panelStyle = {
    position: 'absolute',
    left: `${screenX + 10}px`,
    top:  `${screenY + 10}px`,
  };
}

  return (
    <>
      <div className="shape-select">
        <button
          onClick={() => {
            setShape('square');
            setIsDeleting(false);
            setSelectedIndex(null);
          }}
          className={shape === 'square' ? 'active' : ''}
        >
          <div id="square-btn" />
        </button>
        <button
          onClick={() => {
            setShape('rect');
            setIsDeleting(false);
            setSelectedIndex(null);
          }}
          className={shape === 'rect' ? 'active' : ''}
        >
          <div id="rect-btn" />
        </button>
        <button
          onClick={() => {
            setShape('circle');
            setIsDeleting(false);
            setSelectedIndex(null);
          }}
          className={shape === 'circle' ? 'active' : ''}
        >
          <div id="circle-btn" />
        </button>
        <button
          id="delete-btn"
          onClick={() => {
            setIsDeleting(true);
            setShape('');
            setSelectedIndex(null);
          }}
        >
          🗑️
        </button>
      </div>
      <div className="canvas-container">
    <canvas ref={canvasRef} />

    {showColorPicker && selectedIndex != null && (
      <div className="color-panel" style={panelStyle}>
        <h3>Wybierz kolor:</h3>
        <div className="color-picker-input">
          <input
            type="color"
            value={pickerColor}
            onChange={e => setPickerColor(e.target.value)}
          />
        </div>
        <div className="preset-colors">
          {BASIC_COLORS.map(c => (
            <button
              key={c}
              className={`swatch${pickerColor === c ? ' selected' : ''}`}
              style={{ backgroundColor: c }}
              onClick={() => setPickerColor(c)}
            />
          ))}
        </div>
        <div className="actions">
          <button onClick={saveColor} id='save'>Save</button>
          <button onClick={cancelColor} id='cancel'>Cancel</button>
        </div>
      </div>
    )}
  </div>

    </>
  );
}

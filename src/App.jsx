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
    this.type = 'circle';
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
    this.type = 'rect';
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
    this.type = 'square';
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
  const clipboardRef = useRef(null);
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
  const [previewColor, setPreviewColor] = useState(null);

   /* =========================================================================
     Funkcja do eksportu wszystkich kształtów jako JSON
     ========================================================================= */


/* ---------------------------------------------------------------------
     useEffect: nasłuchujemy, gdy stan „shapes” się zmieni, i logujemy
     --------------------------------------------------------------------- */
 


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
    // Wewnątrz useEffect, zastąp dotychczasową drawAll() poniższą:

// =======================
// 1) drawAll(): rysowanie siatki + figur + uchwytów
// =======================
function drawAll() {
  const canvas = canvasRef.current;
  const ctx = canvas.getContext('2d');

  // 1. Ustaw transformację (zoom + pan) i wyczyść obszar
  ctx.setTransform(scale, 0, 0, scale, viewOffset.x, viewOffset.y);
  ctx.clearRect(
    -viewOffset.x / scale,
    -viewOffset.y / scale,
    canvas.width / scale,
    canvas.height / scale
  );

  // 2. Rysuj siatkę
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 0.5;
  const worldLeft   = -viewOffset.x / scale;
  const worldTop    = -viewOffset.y / scale;
  const worldRight  = (canvas.width  - viewOffset.x) / scale;
  const worldBottom = (canvas.height - viewOffset.y) / scale;

  for (let x = Math.floor(worldLeft / GRID_SIZE) * GRID_SIZE; x < worldRight; x += GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, worldTop);
    ctx.lineTo(x, worldBottom);
    ctx.stroke();
  }
  for (let y = Math.floor(worldTop / GRID_SIZE) * GRID_SIZE; y < worldBottom; y += GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(worldLeft, y);
    ctx.lineTo(worldRight, y);
    ctx.stroke();
  }

  // 3. Rysuj figury (z ewentualnym podglądem koloru, gdy panel jest otwarty)
  shapes.forEach((s, i) => {
    const usePreview = showColorPicker && i === selectedIndex;
    // Jeżeli podgląd – bierzemy kolor z previewColor, w przeciwnym wypadku z s.color
    const fillColor   = usePreview ? previewColor : s.color;
    const strokeColor = usePreview ? darkenColor(previewColor, 0.2) : s.borderColor;

    if (s instanceof Circle) {
      ctx.beginPath();
      ctx.fillStyle   = fillColor;
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth   = 4;                
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
      ctx.closePath();
    } else {
      // Prostokat / kwadrat
      ctx.fillStyle   = fillColor;
      ctx.lineWidth   = 8;
      ctx.strokeStyle = strokeColor;
      ctx.strokeRect(s.x - s.width / 2, s.y - s.height / 2, s.width, s.height);
      ctx.fillRect(  s.x - s.width / 2, s.y - s.height / 2, s.width, s.height);
    }

    // 4. Jeśli to zaznaczona figura, rysujemy uchwyty (handles) w rogach
    if (i === selectedIndex) {
      const hs = 12; // wielkość kwadracika uchwytu w px
      let handles;
      if (s instanceof Circle) {
        handles = {
          tl: [s.x - s.radius, s.y - s.radius],
          tr: [s.x + s.radius, s.y - s.radius],
          bl: [s.x - s.radius, s.y + s.radius],
          br: [s.x + s.radius, s.y + s.radius],
        };
      } else {
        handles = {
          tl: [s.x - s.width / 2,  s.y - s.height / 2],
          tr: [s.x + s.width / 2,  s.y - s.height / 2],
          bl: [s.x - s.width / 2,  s.y + s.height / 2],
          br: [s.x + s.width / 2,  s.y + s.height / 2],
        };
      }

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transformacji, bo uchwyty rysujemy w układzie ekranu
      ctx.fillStyle = 'black';
      Object.values(handles).forEach(([hx, hy]) => {
        const sx = hx * scale + viewOffset.x;
        const sy = hy * scale + viewOffset.y;
        ctx.fillRect(sx - hs / 2, sy - hs / 2, hs, hs);
      });
      ctx.restore();
    }
  });
}

// Nie zapomnij wywoływać drawAll() w odpowiednich momentach,
// np. bezpośrednio po każdej zmianie stanów w useEffect.


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


function onMouseDown(e) {
  const canvas = canvasRef.current;
  const rect = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;
  const worldX = (screenX - viewOffset.x) / scale;
  const worldY = (screenY - viewOffset.y) / scale;

  // 🟡 Nowość: ŚRODKOWY PRZYCISK = PAN
  if (e.button === 1) {
    e.preventDefault();
    setIsPanning(true);
    setLastPan({ x: e.clientX, y: e.clientY });
    return;
  }

  // PRAWY KLIK – panel kolorów
  

  // LEWY KLIK – drag / resize
  if (e.button !== 0) return;

  // 1) Klik w uchwyt rogu → rozpoczynamy RESIZE
  if (
    selectedIndex != null &&
    startResizeIfHitHandle(screenX, screenY, worldX, worldY)
  ) {
    return;
  }

  // 2) Klik w figurę → rozpoczynamy DRAG
  const idx2 = hitTest(screenX, screenY);
  if (idx2 !== -1) {
    if (isDeleting) {
      // Jeśli tryb usuwania – usuń
      setShapes(prev => prev.filter((_, i) => i !== idx2));
      setSelectedIndex(null);
      setShowColorPicker(false);
      drawAll();
      return;
    }
    setShapes(prev => {
      const arr = [...prev];
      const [item] = arr.splice(idx2, 1);
      arr.push(item);
      return arr;
    });
    // Po zapisaniu powyżej w state, nowy indeks to długość tablicy – 1

    const newIndex = shapes.length - 1; // ale uwaga: shape.length tutaj to jeszcze STARY stan
    // Lepiej więc, żeby po zmianie setShapes od razu odczytać właściwy indeks w callbacku:
    setShapes(prev => {
      // Wewnątrz tego callbacka „prev” to już zaktualizowana tablica
      const arr = [...prev];
      const targetIndex = arr.length - 1;
      setSelectedIndex(targetIndex);
      setShowColorPicker(true);
      setPickerColor(arr[targetIndex].color);
      setPreviewColor(arr[targetIndex].color);
      setDraggedIndex(targetIndex);
      setOffset({ x: worldX - arr[targetIndex].x, y: worldY - arr[targetIndex].y });
      return arr;
    });

    return;
  }

  // 3) Klik w tło → deselect + zaczynamy PAN (przesuwanie widoku)
    setSelectedIndex(null);
    setShowColorPicker(false);
  

}

// Pomocnicza funkcja: czy klik w uchwyt resize? Jeśli tak → ustawiamy stan `isResizing` i `resizingCorner`.
function startResizeIfHitHandle(screenX, screenY, worldX, worldY) {
  const s = shapes[selectedIndex];
  if (!s) return false;
  const hs = 12; // wielkość uchwytu w px
  let handles;
  if (s instanceof Circle) {
    handles = {
      tl: [s.x - s.radius, s.y - s.radius],
      tr: [s.x + s.radius, s.y - s.radius],
      bl: [s.x - s.radius, s.y + s.radius],
      br: [s.x + s.radius, s.y + s.radius],
    };
  } else {
    handles = {
      tl: [s.x - s.width / 2,  s.y - s.height / 2],
      tr: [s.x + s.width / 2,  s.y - s.height / 2],
      bl: [s.x - s.width / 2,  s.y + s.height / 2],
      br: [s.x + s.width / 2,  s.y + s.height / 2],
    };
  }

  for (let key in handles) {
    const [hx, hy] = handles[key];
    const sx = hx * scale + viewOffset.x;
    const sy = hy * scale + viewOffset.y;
    if (
      screenX >= sx - hs / 2 && screenX <= sx + hs / 2 &&
      screenY >= sy - hs / 2 && screenY <= sy + hs / 2
    ) {
      setIsResizing(true);
      setResizingCorner(key);
      setShowColorPicker(false);
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
function onMouseMove(e) {
  const canvas = canvasRef.current;
  if (!canvas) return;

  // 1. Obliczamy pozycję kursora względem lewego/górnego rogu canvas:
  const rect = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;

  // 2. PAN: jeśli trwa przesuwanie widoku (środkowy przycisk)
  if (isPanning) {
    const dx = screenX - lastPan.x;
    const dy = screenY - lastPan.y;
    setViewOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    setLastPan({ x: screenX, y: screenY });
    drawAll();
    return;
  }

  // 3. Obliczamy pozycję kursora w "światowych" współrzędnych
  const worldX = (screenX - viewOffset.x) / scale;
  const worldY = (screenY - viewOffset.y) / scale;

  // 4. Połowa grubości obramowania w jednostkach świata:
  const halfStroke = 4 / scale; // lineWidth = 8px → halfStroke = 4px skaluje się / scale

  // 5. RESIZE: jeśli trwa operacja resize i mamy wybraną figurę
  if (
    isResizing &&
    selectedIndex != null &&
    resizingCorner &&
    initialRef.current?.shape
  ) {
    const original = JSON.parse(JSON.stringify(initialRef.current.shape));
    const startX = initialRef.current.x;
    const startY = initialRef.current.y;

    setShapes(prev => {
      const updated = [...prev];
      const s = updated[selectedIndex];

      if (s instanceof Circle) {
        // ======= KOŁO =======
        let fixedX, fixedY;
        const r0 = original.radius;
        const cx = original.x;
        const cy = original.y;

        if (resizingCorner === 'tl') { fixedX = cx + r0; fixedY = cy + r0; }
        if (resizingCorner === 'tr') { fixedX = cx - r0; fixedY = cy + r0; }
        if (resizingCorner === 'bl') { fixedX = cx + r0; fixedY = cy - r0; }
        if (resizingCorner === 'br') { fixedX = cx - r0; fixedY = cy - r0; }

        const dx0 = worldX - fixedX;
        const dy0 = worldY - fixedY;
        const side = Math.min(Math.abs(dx0), Math.abs(dy0));
        const newRadius = Math.max(5, side / 2);

        s.x = fixedX + Math.sign(dx0) * newRadius;
        s.y = fixedY + Math.sign(dy0) * newRadius;
        s.radius = newRadius;

        const r2 = s.radius;
        const outerLeft   = s.x - r2 - halfStroke;
        const outerRight  = s.x + r2 + halfStroke;
        const outerTop    = s.y - r2 - halfStroke;
        const outerBottom = s.y + r2 + halfStroke;

        const dxSnap = getSnapDelta(outerLeft, outerRight);
        const dySnap = getSnapDelta(outerTop, outerBottom);
        s.x += dxSnap;
        s.y += dySnap;

      } else {
        // ======= PROSTOKĄT / KWADRAT =======
        let left, right, top, bottom;
        const ox = original.x;
        const oy = original.y;
        const ow = original.width;
        const oh = original.height;
        const dx0 = worldX - startX;
        const dy0 = worldY - startY;

        if (resizingCorner === 'tl') {
          left   = ox - ow / 2 + dx0;
          top    = oy - oh / 2 + dy0;
          right  = ox + ow / 2;
          bottom = oy + oh / 2;
        } else if (resizingCorner === 'tr') {
          left   = ox - ow / 2;
          top    = oy - oh / 2 + dy0;
          right  = ox + ow / 2 + dx0;
          bottom = oy + oh / 2;
        } else if (resizingCorner === 'bl') {
          left   = ox - ow / 2 + dx0;
          top    = oy - oh / 2;
          right  = ox + ow / 2;
          bottom = oy + oh / 2 + dy0;
        } else if (resizingCorner === 'br') {
          left   = ox - ow / 2;
          top    = oy - oh / 2;
          right  = ox + ow / 2 + dx0;
          bottom = oy + oh / 2 + dy0;
        }

        let outerLeft   = left   - halfStroke;
        let outerRight  = right  + halfStroke;
        let outerTop    = top    - halfStroke;
        let outerBottom = bottom + halfStroke;

        if (resizingCorner.includes('l')) {
          outerLeft += snapOffset(outerLeft);
        }
        if (resizingCorner.includes('r')) {
          outerRight += snapOffset(outerRight);
        }
        if (resizingCorner.includes('t')) {
          outerTop += snapOffset(outerTop);
        }
        if (resizingCorner.includes('b')) {
          outerBottom += snapOffset(outerBottom);
        }

        const innerLeft   = outerLeft   + halfStroke;
        const innerRight  = outerRight  - halfStroke;
        const innerTop    = outerTop    + halfStroke;
        const innerBottom = outerBottom - halfStroke;

        s.width  = Math.max(10, innerRight - innerLeft);
        s.height = Math.max(10, innerBottom - innerTop);
        s.x = (innerLeft + innerRight) / 2;
        s.y = (innerTop  + innerBottom) / 2;
      }

      return updated;
    });

    drawAll();
    return;
  }

  // 6. DRAG: jeśli przenosimy kształt
  if (draggedIndex != null) {
    setShowColorPicker(false);

    setShapes(prev => {
      const u = [...prev];
      let x = worldX - offset.x;
      let y = worldY - offset.y;
      const s = u[draggedIndex];

      const halfStroke = 4 / scale;

      if (s instanceof Circle) {
        const r = s.radius;
        const outerLeft   = x - r - halfStroke;
        const outerRight  = x + r + halfStroke;
        const outerTop    = y - r - halfStroke;
        const outerBottom = y + r + halfStroke;

        const dxSnap = getSnapDelta(outerLeft, outerRight);
        const dySnap = getSnapDelta(outerTop, outerBottom);
        x += dxSnap;
        y += dySnap;

      } else {
        const halfW = s.width  / 2;
        const halfH = s.height / 2;

        const outerLeft   = x - halfW - halfStroke;
        const outerRight  = x + halfW + halfStroke;
        const outerTop    = y - halfH - halfStroke;
        const outerBottom = y + halfH + halfStroke;

        const dxSnap = getSnapDelta(outerLeft, outerRight);
        const dySnap = getSnapDelta(outerTop, outerBottom);
        x += dxSnap;
        y += dySnap;
      }

      s.x = x;
      s.y = y;
      return u;
    });

    drawAll();
    return;
  }

  // 7. Gdy nic innego nie robimy – (opcjonalnie można zmienić kursor)
}






    /* ------------------------------------------------------------------
       MOUSE‑UP – kończy panning / drag / resize
       ------------------------------------------------------------------ */
   function onMouseUp() {
  // zapamiętujemy, czy trwała operacja resize lub drag
  const wasResizing = isResizing;
  const wasDragging = draggedIndex != null;

  // zerujemy stany związane z przeciąganiem/powiększaniem
  setIsPanning(false);
  setDraggedIndex(null);
  setIsResizing(false);
  initialRef.current = null;

  // Jeżeli zakończyliśmy operację resize lub drag, to logujemy tylko tę jedną figurę:
  if ((wasResizing || wasDragging) && selectedIndex != null) {
    setShowColorPicker(true);
    const s = shapes[selectedIndex];
    setPickerColor(s.color);
    setPreviewColor(s.color);

    // Logujemy dane tylko tego kształtu:
    if (s instanceof Circle) {
      console.log(
        `Object: Circle
position: (${s.x.toFixed(0)}, ${s.y.toFixed(0)})
radius: ${(s.radius + 4).toFixed(0)}
color: ${s.color}
border_color: ${s.borderColor}`
      );
    } else {
      // rozpoznajemy, czy to prostokąt czy kwadrat
      const isSquare = s.width === s.height;
      const typeName = isSquare ? "Square" : "Rect";
      // dla Rect/Square x,y to środek → przeliczamy na lewy-górny róg (+4 bo obramowanie 8px)
      const left = (s.x - s.width / 2 - 4).toFixed(0);
      const top  = (s.y - s.height / 2 - 4).toFixed(0);
      console.log(
        `Object: ${typeName}
position: (${left}, ${top})
width: ${(s.width + 8).toFixed(0)}
height: ${(s.height + 8).toFixed(0)}
color: ${s.color}
border_color: ${s.borderColor}`
      );
    }
  }
}


    /* ------------------------------------------------------------------
       Dodatkowe eventy (contextmenu, scroll‑zoom, dblclick, klawisze)
       ------------------------------------------------------------------ */


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
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - viewOffset.x) / scale;
    const y = (e.clientY - rect.top - viewOffset.y) / scale;
    let n = null;

    if (shape === 'circle') {
      n = new Circle(x, y, 46, "#e0e0e0", "#9e9e9e");
      console.log(`Object: Circle \nposition: (${n.x}, ${n.y}) \nradius: ${n.radius + 4} \ncolor: ${n.color} \nborder_color: ${n.borderColor}`);
    }
    if (shape === 'rect') {
      n = new Rect(x, y, 192, 92, "#e0e0e0", "#9e9e9e");
      console.log(`Object: Rect \nposition: (${n.x - n.width / 2 - 4}, ${n.y + n.height + 4}) \nwidth: ${n.width + 8} \nheight: ${n.height + 8} \ncolor: ${n.color} \nborder_color: ${n.borderColor}`);
    }
    if (shape === 'square') {
      n = new Square(x, y, 92, "#e0e0e0", "#9e9e9e");
      console.log(`Object: Square \nposition: (${n.x - n.width / 2 - 4}, ${n.y + n.height + 4}) \nwidth: ${n.width + 8} \nheight: ${n.height + 8} \ncolor: ${n.color} \nborder_color: ${n.borderColor}`);
    }

    if (n) {
      setShapes(prev => {
        const u = [...prev, n];
        return u;
      });
      // Nie logujemy tutaj – logika przeniesiona do useEffect, bo kształty mogą się
      // zmieniać także przy przesuwaniu, usuwaniu czy zmianie koloru.
    }
  };


const onKeyDown = e => {
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

  // 🔄 RESET ZOOMU
  if (ctrlOrCmd && e.key === '0') {
    e.preventDefault();
    setScale(1);
    setViewOffset({ x: 0, y: 0 });
    return;
  }

  // 🧷 KOPIOWANIE
  if (ctrlOrCmd && e.key === 'c') {
    e.preventDefault();
    if (selectedIndex != null) {
      const original = shapes[selectedIndex];
      clipboardRef.current = JSON.parse(JSON.stringify(original));
      clipboardRef.current.type = original instanceof Circle ? 'circle' : 'rect';
    }
    return;
  }

  // 📋 WKLEJANIE
  if (ctrlOrCmd && e.key === 'v') {
    e.preventDefault();
    const copied = clipboardRef.current;
    if (!copied) return;

    let newShape = null;

    if (copied.type === 'circle') {
      newShape = new Circle(
        copied.x + 40,
        copied.y + 40,
        copied.radius,
        copied.color,
        copied.borderColor
      );
    } else if (copied.type === 'rect') {
      newShape = new Rect(
        copied.x + 40,
        copied.y + 40,
        copied.width,
        copied.height,
        copied.color,
        copied.borderColor
      );
    }

    if (newShape) {
      setShapes(prev => {
        const updated = [...prev, newShape];
        setSelectedIndex(updated.length - 1);
        setShowColorPicker(true);
        setPickerColor(newShape.color);
        setPreviewColor(newShape.color);
        return updated;
      });

      // Automatyczne przesuwanie w clipboardzie przy kolejnych Ctrl+V
      clipboardRef.current.x += 40;
      clipboardRef.current.y += 40;
    }
    return;
  }
};

    /* ------------------------------------------------------------------
       Rejestracja listenerów
       ------------------------------------------------------------------ */
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mouseup', onMouseUp);
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
  useEffect(() => {
    // 1) Przechwycenie naciśnięcia F5
    const handleKeyDown = (e) => {
      if (e.key === 'F5') {
        e.preventDefault(); // blokujemy domyślne odświeżenie
        const confirmReload = window.confirm('Czy na pewno chcesz odświeżyć stronę?');
        if (confirmReload) {
          window.location.reload();
        }
      }
    };

    // 2) Obsługa beforeunload dla pozostałych sposobów odświeżenia / zamknięcia
    const handleBeforeUnload = (e) => {
      // Standardowy dialog przeglądarki. Ustawienie returnValue wymusza pokazanie okna.
      e.preventDefault();
      e.returnValue = ''; 
      // Tekst w niektórych przeglądarkach nie jest wyświetlany, ale e.returnValue='' powoduje
      // że przeglądarka wyświetli domyślny komunikat potwierdzający opuszczenie/odświeżenie.
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
  /* ---------------------------------------------------------------------
     JSX – przyciski + canvas
     --------------------------------------------------------------------- */
// w górze App(), przed return:


let panelStyle = {};
if (showColorPicker && selectedIndex != null) {
  const s = shapes[selectedIndex];
  const screenX = s.x * scale + viewOffset.x;
  let objectTop;
if (s instanceof Circle) {
  objectTop = (s.y - s.radius) * scale + viewOffset.y;
} else {
  objectTop = (s.y - s.height / 2) * scale + viewOffset.y;
}

 panelStyle = {
  position: 'absolute',
  left: `${screenX - 150}px`,
  top:  `${objectTop - 100}px`, // ZAWSZE 40px nad górną krawędzią
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
          <div
            id="square-btn"
            className={shape === 'square' ? 'active-shape' : ''}
          />
        </button>
        <button
          onClick={() => {
            setShape('rect');
            setIsDeleting(false);
            setSelectedIndex(null);
          }}
          className={shape === 'rect' ? 'active' : ''}
        >
          <div
            id="rect-btn"
            className={shape === 'rect' ? 'active-shape' : ''}
          />
        </button>
        <button
          onClick={() => {
            setShape('circle');
            setIsDeleting(false);
            setSelectedIndex(null);
          }}
          className={shape === 'circle' ? 'active' : ''}
        >
          <div
            id="circle-btn"
            className={shape === 'circle' ? 'active-shape' : ''}
          />
        </button>
        <button
          id="delete-btn"
          onClick={() => {
            setIsDeleting(true);
            setShape('');
            setSelectedIndex(null);
          }}
          className={isDeleting ? 'active-shape' : ''}
        >
          🗑️
        </button>

        
        
      </div>

      <div className="canvas-container">
        <canvas ref={canvasRef} />

        {showColorPicker && selectedIndex != null && (
          <div className="color-panel" style={panelStyle}>
            <h3>Wybierz kolor:</h3>
            <div className="preset-colors">
              <input
                type="color"
                value={pickerColor}
                onChange={e => {
                  const c = e.target.value;
                  setPickerColor(c);
                  setPreviewColor(c);
                  setShapes(prev => {
                    const upd = [...prev];
                    const s = upd[selectedIndex];
                    s.color = c;
                    s.borderColor = darkenColor(c, 0.2);
                    return upd;
                  });
                }}
              />
              {BASIC_COLORS.map(c => (
                <button
                  key={c}
                  className={`swatch${pickerColor === c ? ' selected' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => {
                    setPickerColor(c);
                    setPreviewColor(c);
                    setShapes(prev => {
                      const upd = [...prev];
                      const s = upd[selectedIndex];
                      s.color = c;
                      s.borderColor = darkenColor(c, 0.2);
                      return upd;
                    });
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

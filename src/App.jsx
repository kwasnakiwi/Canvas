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
  const [previewColor, setPreviewColor] = useState(null);

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

  // ––––– PRAWY KLIK ––––– wybór/deselekcja figury + otwarcie panelu kolorów
  if (e.button === 2) {
    e.preventDefault();
    const idx = hitTest(screenX, screenY);
    setSelectedIndex(idx !== -1 ? idx : null);
    setShowColorPicker(idx !== -1);
    setIsResizing(false);
    if (idx !== -1) {
      // Ustawiamy początkowy kolor podglądu z już istniejącej figury
      setPickerColor(shapes[idx].color);
      setPreviewColor(shapes[idx].color);
    }
    return;
  }

  // ––––– LEWY KLIK ––––– drag / resize / pan (bez zmiany `selectedIndex`)
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
      // Jeżeli tryb usuwania, to od razu usuwamy figurę i odznaczamy
      setShapes(prev => prev.filter((_, i) => i !== idx2));
      setSelectedIndex(null);
      setShowColorPicker(false);
      drawAll();
      return;
    }
    setDraggedIndex(idx2);
    setOffset({ x: worldX - shapes[idx2].x, y: worldY - shapes[idx2].y });
    setShowColorPicker(false);
    return;
  }

  // 3) Klik w tło → deselect + zaczynamy PAN (przesuwanie widoku)
  setSelectedIndex(null);
  setShowColorPicker(false);
  setIsPanning(true);
  setLastPan({ x: e.clientX, y: e.clientY });
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
  const rect = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;

  // 1️⃣ PAN — jeśli trwa przesuwanie widoku
  if (isPanning) {
    const dx = e.clientX - lastPan.x;
    const dy = e.clientY - lastPan.y;
    setViewOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    setLastPan({ x: e.clientX, y: e.clientY });
    drawAll();
    return;
  }

  // 2️⃣ Obliczamy mysz w "światowych" współrzędnych
  const worldX = (screenX - viewOffset.x) / scale;
  const worldY = (screenY - viewOffset.y) / scale;

  // 3️⃣ Połowa obramowania w jednostkach świata:
  //     lineWidth = 8px, więc halfStroke = 4px przeskalowane:
  const halfStroke = 4 / scale;

  // 4️⃣ RESIZE — jeśli aktywna operacja resize i wybrano figurę
  if (
    isResizing &&
    selectedIndex != null &&
    resizingCorner &&
    initialRef.current?.shape
  ) {
    // Zapamiętujemy oryginalne wymiary + pozycję przed rozpoczęciem resize
    const original = JSON.parse(JSON.stringify(initialRef.current.shape));
    const startX = initialRef.current.x;
    const startY = initialRef.current.y;

    setShapes(prev => {
      const updated = [...prev];
      const s = updated[selectedIndex];

      if (s instanceof Circle) {
        // —————— KOŁO ——————
        // Wyznaczamy, który punkt (fixedX,fixedY) jest przeciwległym bokiem:
        let fixedX, fixedY;
        const r0 = original.radius;
        const cx = original.x;
        const cy = original.y;

        if (resizingCorner === 'tl') { fixedX = cx + r0; fixedY = cy + r0; }
        if (resizingCorner === 'tr') { fixedX = cx - r0; fixedY = cy + r0; }
        if (resizingCorner === 'bl') { fixedX = cx + r0; fixedY = cy - r0; }
        if (resizingCorner === 'br') { fixedX = cx - r0; fixedY = cy - r0; }

        // Nowy promień tak, aby kursor przy „ciągniętym” rogu pokrywał brzeg koła:
        const dx0 = worldX - fixedX;
        const dy0 = worldY - fixedY;
        const side = Math.min(Math.abs(dx0), Math.abs(dy0));
        const newRadius = Math.max(5, side / 2);

        // Przesuwamy środek koła tak, by “ciągnięty” brzeg zawsze podążał za wskaźnikiem:
        s.x = fixedX + Math.sign(dx0) * newRadius;
        s.y = fixedY + Math.sign(dy0) * newRadius;
        s.radius = newRadius;

        // Obliczamy bounding‐box wraz z połową obramowania:
        const r2 = s.radius;
        const left   = s.x - r2 - halfStroke;
        const right  = s.x + r2 + halfStroke;
        const top    = s.y - r2 - halfStroke;
        const bottom = s.y + r2 + halfStroke;

        // Snapping: “łapiemy” którejś z tych zewnętrznych krawędzi
        const dxSnap = getSnapDelta(left, right);
        const dySnap = getSnapDelta(top, bottom);
        s.x += dxSnap;
        s.y += dySnap;

      } else {
        // —————— PROSTOKĄT / KWADRAT ——————
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

        // Rozszerzamy krawędzie o halfStroke, by uwzględnić lineWidth:
        left   -= halfStroke;
        right  += halfStroke;
        top    -= halfStroke;
        bottom += halfStroke;

        // Snapujemy tylko te krawędzie, które faktycznie ruszamy:
        if (resizingCorner.includes('l')) {
          left += snapOffset(left);
        }
        if (resizingCorner.includes('r')) {
          right += snapOffset(right);
        }
        if (resizingCorner.includes('t')) {
          top += snapOffset(top);
        }
        if (resizingCorner.includes('b')) {
          bottom += snapOffset(bottom);
        }

        // Na podstawie nowych, “snapniętych” krawędzi ustawiamy wymiary i środek:
        s.width  = Math.max(10, right - left);
        s.height = Math.max(10, bottom - top);
        s.x = (left + right) / 2;
        s.y = (top + bottom) / 2;
      }

      return updated;
    });

    // Po każdej zmianie wielkości należy ponownie narysować całą scenę:
    drawAll();
    return;
  }

  // 5️⃣ DRAG: jeśli przenosimy kształt
  if (draggedIndex != null) {
    setShapes(prev => {
      const u = [...prev];
      let x = worldX - offset.x;
      let y = worldY - offset.y;
      const s = u[draggedIndex];

      if (s instanceof Circle) {
        const r = s.radius;
        // Łapiemy bounding‐box koła z obramowaniem:
        const dxSnap = getSnapDelta(
          x - r - halfStroke,
          x + r + halfStroke
        );
        const dySnap = getSnapDelta(
          y - r - halfStroke,
          y + r + halfStroke
        );
        x += dxSnap;
        y += dySnap;
      } else {
        const halfW = s.width / 2;
        const halfH = s.height / 2;
        // Łapiemy bounding‐box prostokąta z obramowaniem:
        const dxSnap = getSnapDelta(
          x - halfW - halfStroke,
          x + halfW + halfStroke
        );
        const dySnap = getSnapDelta(
          y - halfH - halfStroke,
          y + halfH + halfStroke
        );
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

  // 6️⃣ Gdy nic innego nie robimy, można tu ewentualnie ustawiać cursor="nwse-resize" itp.,
  //    ale to już wyłącznie kosmetyka — snap działa powyżej.
}





    /* ------------------------------------------------------------------
       MOUSE‑UP – kończy panning / drag / resize
       ------------------------------------------------------------------ */
   function onMouseUp() {
  setIsPanning(false);
  setDraggedIndex(null);
  setIsResizing(false);
  initialRef.current = null;
    // Za każdym razem, gdy „shapes” zostanie zmienione, wypisujemy informacje
    // o wszystkich obecnych kształtach w konsoli.

    shapes.forEach((s) => {
      
        if (s instanceof Circle) {
        console.log(
          `Object: Circle \nposition: (${s.x}, ${s.y}) \nradius: ${s.radius} \ncolor: ${s.color} \nborder_color: ${s.borderColor}`
        );
      } else if (s instanceof Rect) {
        console.log(
          `Object: Rect \nposition: (${s.x - s.width / 2 - 4}, ${s.y + s.height / 2 + 4}) \nwidth: ${s.width} \nheight: ${s.height} \ncolor: ${s.color} \nborder_color: ${s.borderColor}`
        );
      }
      
    });

}

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
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - viewOffset.x) / scale;
    const y = (e.clientY - rect.top - viewOffset.y) / scale;
    let n = null;

    if (shape === 'circle') {
      n = new Circle(x, y, 46, "#e0e0e0", "#9e9e9e");
      console.log(`Object: Circle \nposition: (${n.x}, ${n.y}) \nradius: ${n.radius} \ncolor: ${n.color} \nborder_color: ${n.borderColor}`);
    }
    if (shape === 'rect') {
      n = new Rect(x, y, 192, 92, "#e0e0e0", "#9e9e9e");
      console.log(`Object: Rect \nposition: (${n.x - n.width / 2 - 4}, ${n.y + n.height + 4}) \nwidth: ${n.width} \nheight: ${n.height} \ncolor: ${n.color} \nborder_color: ${n.borderColor}`);
    }
    if (shape === 'square') {
      n = new Square(x, y, 92, "#e0e0e0", "#9e9e9e");
      console.log(`Object: Square \nposition: (${n.x - n.width / 2 - 4}, ${n.y + n.height + 4}) \nwidth: ${n.width} \nheight: ${n.height} \ncolor: ${n.color} \nborder_color: ${n.borderColor}`);
    }

    if (n) {
      setShapes(prev => {
        const u = [...prev, n];
        setSelectedIndex(u.length - 1);
        return u;
      });
      // Nie logujemy tutaj – logika przeniesiona do useEffect, bo kształty mogą się
      // zmieniać także przy przesuwaniu, usuwaniu czy zmianie koloru.
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
          <div id="square-btn"
            className={shape === 'square' ? 'active-shape' : ''}>
          </div>
        </button>
        <button
          onClick={() => {
            setShape('rect');
            setIsDeleting(false);
            setSelectedIndex(null);
          }}
          className={shape === 'rect' ? 'active' : ''}
        >
          <div id="rect-btn"
            className={shape === 'rect' ? 'active-shape' : ''}>
          </div>
        </button>
       <button onClick={() => {
        setShape('circle');
      setIsDeleting(false);
            setSelectedIndex(null);}}
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
          className={isDeleting === true ? 'active-shape' : ''}
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
        onChange={e => {
          const c = e.target.value;
          setPickerColor(e.target.value);
          setPreviewColor(e.target.value);
          setShapes(prev => {
            const upd = [...prev];
            const s = upd[selectedIndex];
            s.color = c;
            s.borderColor = darkenColor(c, 0.2);
            return upd;
          });
        }}
      />
    </div>
    <div className="preset-colors">
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

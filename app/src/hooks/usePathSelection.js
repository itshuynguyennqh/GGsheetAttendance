import { useCallback, useRef, useState } from 'react';

export function usePathSelection({ rows, cols, seatAssignments, disabledSeats = [] }) {
  const [selectedPath, setSelectedPath] = useState([]);
  const [isSelecting, setIsSelecting] = useState(false);
  const gridRef = useRef(null);
  const disabledSet = useRef(new Set(disabledSeats));

  disabledSet.current = new Set(disabledSeats);

  const getCellFromPoint = useCallback((clientX, clientY) => {
    if (!gridRef.current) return null;
    const gridEl = gridRef.current;
    const rect = gridEl.getBoundingClientRect();
    const x = clientX - rect.left + gridEl.scrollLeft;
    const y = clientY - rect.top + gridEl.scrollTop;

    const cellWidth = gridEl.scrollWidth / cols;
    const cellHeight = gridEl.scrollHeight / rows;

    const col = Math.floor(x / cellWidth);
    const row = Math.floor(y / cellHeight);

    if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
    return { row, col };
  }, [rows, cols]);

  const canSelect = useCallback((row, col) => {
    const key = `${row}-${col}`;
    if (disabledSet.current.has(key)) return false;
    return true;
  }, []);

  const handlePointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const cell = getCellFromPoint(e.clientX, e.clientY);
    if (!cell || !canSelect(cell.row, cell.col)) return;

    setIsSelecting(true);
    setSelectedPath([cell]);

    if (e.target.setPointerCapture) {
      e.target.setPointerCapture(e.pointerId);
    }
  }, [getCellFromPoint, canSelect]);

  const handlePointerMove = useCallback((e) => {
    if (!isSelecting) return;
    e.preventDefault();

    const cell = getCellFromPoint(e.clientX, e.clientY);
    if (!cell || !canSelect(cell.row, cell.col)) return;

    setSelectedPath((prev) => {
      const exists = prev.some((p) => p.row === cell.row && p.col === cell.col);
      if (exists) return prev;
      return [...prev, cell];
    });
  }, [isSelecting, getCellFromPoint, canSelect]);

  const handlePointerUp = useCallback(() => {
    setIsSelecting(false);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPath([]);
    setIsSelecting(false);
  }, []);

  return {
    gridRef,
    selectedPath,
    isSelecting,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    clearSelection,
    setSelectedPath,
  };
}

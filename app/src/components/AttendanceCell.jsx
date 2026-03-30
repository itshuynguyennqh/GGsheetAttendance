import React, { memo, useCallback } from 'react';
import { Box, TableCell } from '@mui/material';

/**
 * Native <select> thay MUI Select: kéo virtual nhanh tới cuối bảng không còn mount
 * hàng trăm Select/Menu/Portal cùng lúc (nguyên nhân chính gây lag).
 */
function getValueBgColor(val) {
  const v = (val || '').toUpperCase();
  if (v === 'M' || v === 'B') return 'primary.light';
  if (v === 'P') return 'error.light';
  if (v === 'X') return 'success.light';
  return 'transparent';
}

const selectSx = {
  width: '100%',
  height: 36,
  m: 0,
  py: 0.5,
  px: 0.5,
  fontWeight: 600,
  textAlign: 'center',
  textAlignLast: 'center',
  border: 'none',
  borderRadius: 0,
  backgroundColor: 'transparent',
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontFamily: 'inherit',
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='%23666' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 4px center',
  paddingRight: '20px',
  boxSizing: 'border-box',
};

const AttendanceCell = memo(
  ({
    studentId,
    sessionId,
    cellKey,
    value,
    note,
    isSelected,
    isFocused,
    cellRefs,
    focusedCellRef,
    onValChange,
    onKeyDown,
    onCellClick,
    setFocusedCell,
    setSelectedCells,
    setOpenDropdowns,
  }) => {
    const handleChange = useCallback(
      (e) => {
        onValChange(studentId, sessionId, e.target.value);
        setFocusedCell(cellKey);
        setSelectedCells(new Set([cellKey]));
        setOpenDropdowns((prev) => {
          const next = new Set(prev);
          next.delete(cellKey);
          return next;
        });
      },
      [studentId, sessionId, cellKey, onValChange, setFocusedCell, setSelectedCells, setOpenDropdowns]
    );

    const handleKeyDown = useCallback(
      (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          onKeyDown(e, studentId, sessionId);
          return;
        }
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          setOpenDropdowns((prev) => new Set(prev).add(cellKey));
        }
        onKeyDown(e, studentId, sessionId);
      },
      [onKeyDown, studentId, sessionId, cellKey, setOpenDropdowns]
    );

    const handleFocus = useCallback(
      (e) => {
        focusedCellRef.current = cellKey;
        setFocusedCell(cellKey);
        if (!e.shiftKey) setSelectedCells(new Set([cellKey]));
      },
      [cellKey, focusedCellRef, setFocusedCell, setSelectedCells]
    );

    return (
      <TableCell
        align="center"
        padding="none"
        title={note || undefined}
        sx={{
          position: 'relative',
          bgcolor:
            isSelected ? 'action.selected' : isFocused ? 'action.focus' : getValueBgColor(value),
          '&:focus-within': { bgcolor: 'action.focus' },
          ...(isSelected && {
            boxShadow: (t) => `inset 0 0 0 2px ${t.palette.primary.main}`,
          }),
        }}
        onClick={(e) => onCellClick(e, studentId, sessionId)}
      >
        <Box
          component="select"
          ref={(el) => {
            if (el) cellRefs.current[cellKey] = el;
            else delete cellRefs.current[cellKey];
          }}
          value={value || ''}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onMouseDown={(e) => {
            if (e.shiftKey) e.preventDefault();
          }}
          data-cell-key={cellKey}
          aria-label="Điểm danh"
          sx={{
            ...selectSx,
            color: 'text.primary',
            '&:focus': { outline: 'none' },
          }}
        >
          <option value="">—</option>
          <option value="X">X - Có mặt</option>
          <option value="B">B - Bù</option>
          <option value="M">M - Nghỉ phép</option>
          <option value="P">P - Nghỉ</option>
        </Box>
        {note ? (
          <Box component="span" sx={{ position: 'absolute', top: 2, right: 2, fontSize: '0.65rem', pointerEvents: 'none' }}>
            📝
          </Box>
        ) : null}
      </TableCell>
    );
  },
  (prev, next) =>
    prev.value === next.value &&
    prev.note === next.note &&
    prev.isSelected === next.isSelected &&
    prev.isFocused === next.isFocused
);

AttendanceCell.displayName = 'AttendanceCell';
export default AttendanceCell;

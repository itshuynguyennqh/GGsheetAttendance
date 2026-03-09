import React, { memo, useCallback } from 'react';
import { Box, MenuItem, Select, TableCell, Tooltip } from '@mui/material';
import { ArrowDropDown } from '@mui/icons-material';

function getValueBgColor(val) {
  const v = (val || '').toUpperCase();
  if (v === 'M' || v === 'B') return 'primary.light';
  if (v === 'P') return 'error.light';
  if (v === 'X') return 'success.light';
  return 'transparent';
}

const AttendanceCell = memo(
  ({
    studentId,
    sessionId,
    cellKey,
    value,
    note,
    isSelected,
    isFocused,
    isOpen,
    cellRefs,
    focusedCellRef,
    onValChange,
    onKeyDown,
    onCellClick,
    setFocusedCell,
    setSelectedCells,
    setOpenDropdowns,
    getCellKey,
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
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !isOpen) {
          e.preventDefault();
          e.stopPropagation();
          onKeyDown(e, studentId, sessionId);
          return;
        }
        onKeyDown(e, studentId, sessionId);
      },
      [isOpen, onKeyDown, studentId, sessionId]
    );

    const handleFocus = useCallback(
      (e) => {
        focusedCellRef.current = cellKey;
        setFocusedCell(cellKey);
        if (!e.shiftKey) setSelectedCells(new Set([cellKey]));
      },
      [cellKey, focusedCellRef, setFocusedCell, setSelectedCells]
    );

    const handleOpen = useCallback(() => {
      setFocusedCell(cellKey);
      setSelectedCells(new Set([cellKey]));
      setOpenDropdowns((prev) => new Set(prev).add(cellKey));
    }, [cellKey, setFocusedCell, setSelectedCells, setOpenDropdowns]);

    const handleClose = useCallback(() => {
      setOpenDropdowns((prev) => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }, [cellKey, setOpenDropdowns]);

    const handleClick = useCallback(
      (e) => {
        const target = e.target;
        const isIconClick =
          target?.closest('.MuiSelect-icon') ||
          target?.classList?.contains('MuiSelect-icon') ||
          target?.closest('[class*="MuiSelect-icon"]') ||
          target?.closest('[data-icon-click]');
        if (!isIconClick) {
          e.stopPropagation();
          e.preventDefault();
          if (!e.shiftKey) setSelectedCells(new Set([cellKey]));
          setFocusedCell(cellKey);
          if (isOpen) handleClose();
        }
      },
      [cellKey, isOpen, setFocusedCell, setSelectedCells, handleClose]
    );

    const handleIconClick = useCallback(
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        setFocusedCell(cellKey);
        setSelectedCells(new Set([cellKey]));
        if (!isOpen) handleOpen();
      },
      [cellKey, isOpen, setFocusedCell, setSelectedCells, handleOpen]
    );

    return (
      <Tooltip title={note || ''}>
        <TableCell
          align="center"
          padding="none"
          sx={{
            position: 'relative',
            bgcolor:
              isSelected ? 'action.selected' : isFocused ? 'action.focus' : getValueBgColor(value),
            '&:focus-within': { bgcolor: 'action.focus' },
          }}
          onClick={(e) => onCellClick(e, studentId, sessionId)}
        >
          <Select
            ref={(el) => {
              if (el) cellRefs.current[cellKey] = el;
              else delete cellRefs.current[cellKey];
            }}
            value={value || ''}
            open={isOpen}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onOpen={handleOpen}
            onClose={handleClose}
            onClick={handleClick}
            IconComponent={(props) => (
              <Box
                component="span"
                data-icon-click="true"
                onClick={handleIconClick}
                onMouseDown={handleIconClick}
                sx={{ cursor: 'pointer', pointerEvents: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <ArrowDropDown {...props} />
              </Box>
            )}
            size="small"
            data-cell-key={cellKey}
            sx={{
              width: '100%',
              fontWeight: 600,
              '& .MuiSelect-select': { py: 0.5, px: 1, minHeight: 'auto', textAlign: 'center', cursor: 'default' },
              '& .MuiSelect-icon': { cursor: 'pointer', pointerEvents: 'auto !important', zIndex: 1 },
              '& .MuiOutlinedInput-notchedOutline': {
                border: isSelected ? '2px solid' : 'none',
                borderColor: isSelected ? 'primary.main' : 'transparent',
              },
            }}
            MenuProps={{
              PaperProps: { sx: { maxHeight: 200 } },
              onKeyDown: (e) => {
                if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                  e.stopPropagation();
                  handleClose();
                  onKeyDown(e, studentId, sessionId);
                }
              },
            }}
          >
            <MenuItem value="">—</MenuItem>
            <MenuItem value="X">X - Có mặt</MenuItem>
            <MenuItem value="B">B - Bù</MenuItem>
            <MenuItem value="M">M - Nghỉ phép</MenuItem>
            <MenuItem value="P">P - Nghỉ</MenuItem>
          </Select>
          {note && (
            <Box component="span" sx={{ position: 'absolute', top: 2, right: 2, fontSize: '0.7rem' }}>
              📝
            </Box>
          )}
        </TableCell>
      </Tooltip>
    );
  },
  (prev, next) =>
    prev.value === next.value &&
    prev.note === next.note &&
    prev.isSelected === next.isSelected &&
    prev.isFocused === next.isFocused &&
    prev.isOpen === next.isOpen
);

AttendanceCell.displayName = 'AttendanceCell';
export default AttendanceCell;

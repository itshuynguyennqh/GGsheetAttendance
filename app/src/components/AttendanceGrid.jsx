import React, { useRef } from 'react';
import { Box, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { useVirtualizer } from '@tanstack/react-virtual';
import AttendanceCell from './AttendanceCell';

const ROW_HEIGHT = 40;
const SEPARATOR_HEIGHT = 2;
const SESSION_COL_PX = 112;
const COL_MA = 80;
const COL_TEN = 160;
const FROZEN_W = COL_MA + COL_TEN;
/** Chiều cao hàng header (sticky top + scrollMargin cho virtual) */
const HEADER_ROW_H = 52;

const stickyFrozen = {
  position: 'sticky',
  zIndex: 3,
  backgroundColor: 'background.paper',
  boxSizing: 'border-box',
  boxShadow: '4px 0 8px -2px rgba(0,0,0,0.08)',
};
const stickyHeaderFrozen = {
  ...stickyFrozen,
  zIndex: 5,
  bgcolor: 'primary.light',
  boxShadow: '4px 0 10px -2px rgba(0,0,0,0.12)',
};

function rowMinWidth(sessionCount) {
  return FROZEN_W + sessionCount * SESSION_COL_PX;
}

function renderRowContent(
  row,
  rowKey,
  sessionGroups,
  getCellKey,
  getVal,
  getNote,
  selectedCells,
  focusedCell,
  cellRefs,
  focusedCellRef,
  setCellValue,
  onKeyDown,
  onCellClick,
  setFocusedCell,
  setSelectedCells,
  setOpenDropdowns,
  virtualRowSize
) {
  const w = rowMinWidth(sessionGroups.length);
  if (row.type === 'separator') {
    return (
      <Box
        key={rowKey}
        component="div"
        sx={{
          height: virtualRowSize,
          minHeight: virtualRowSize,
          width: w,
          minWidth: w,
          bgcolor: 'grey.300',
          flexShrink: 0,
        }}
      />
    );
  }
  const { student, classData } = row;
  return (
    <Box
      key={rowKey}
      component="div"
      sx={{
        display: 'flex',
        alignItems: 'stretch',
        width: w,
        minWidth: w,
        height: virtualRowSize,
        minHeight: virtualRowSize,
        flexShrink: 0,
      }}
    >
      <Box
        component="div"
        sx={{
          ...stickyFrozen,
          left: 0,
          flex: `0 0 ${COL_MA}px`,
          width: COL_MA,
          minWidth: COL_MA,
          py: 0.5,
          px: 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        {student.maHV}
      </Box>
      <Box
        component="div"
        sx={{
          ...stickyFrozen,
          left: COL_MA,
          flex: `0 0 ${COL_TEN}px`,
          width: COL_TEN,
          minWidth: COL_TEN,
          py: 0.5,
          px: 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        {student.hoTen}
      </Box>
      {sessionGroups.map(([groupKey, groupSessions]) => {
        const session = groupSessions.find((s) => s.classId === classData.class.id);
        if (!session) {
          return (
            <Box
              key={`${classData.class.id}-${groupKey}`}
              component="div"
              align="center"
              sx={{
                flex: `0 0 ${SESSION_COL_PX}px`,
                minWidth: SESSION_COL_PX,
                width: SESSION_COL_PX,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'grey.100',
                color: 'grey.400',
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              —
            </Box>
          );
        }
        const cellKey = getCellKey(student.id, session.id);
        return (
          <Box
            key={cellKey}
            component="div"
            sx={{
              flex: `0 0 ${SESSION_COL_PX}px`,
              minWidth: SESSION_COL_PX,
              width: SESSION_COL_PX,
              display: 'flex',
              alignItems: 'stretch',
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <AttendanceCell
              studentId={student.id}
              sessionId={session.id}
              cellKey={cellKey}
              value={getVal(student.id, session.id)}
              note={getNote?.(student.id, session.id) ?? ''}
              isSelected={selectedCells.has(cellKey)}
              isFocused={focusedCell === cellKey}
              cellRefs={cellRefs}
              focusedCellRef={focusedCellRef}
              onValChange={setCellValue}
              onKeyDown={onKeyDown}
              onCellClick={onCellClick}
              setFocusedCell={setFocusedCell}
              setSelectedCells={setSelectedCells}
              setOpenDropdowns={setOpenDropdowns}
            />
          </Box>
        );
      })}
    </Box>
  );
}

export default function AttendanceGrid({
  rows,
  sessionGroups,
  loading,
  getVal,
  getNote,
  setCellValue,
  getCellKey,
  selectedCells,
  focusedCell,
  setFocusedCell,
  setSelectedCells,
  setOpenDropdowns,
  cellRefs,
  focusedCellRef,
  onKeyDown,
  onCellClick,
}) {
  const parentRef = useRef(null);
  const minW = rowMinWidth(sessionGroups.length);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i]?.type === 'separator' ? SEPARATOR_HEIGHT : ROW_HEIGHT),
    overscan: 8,
    scrollMargin: HEADER_ROW_H,
  });

  const virtualItems = virtualizer.getVirtualItems();

  if (rows.length === 0 && !loading) {
    return (
      <TableContainer component={Paper} sx={{ maxHeight: 500, flex: 1, overflow: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ bgcolor: 'primary.light', minWidth: COL_MA, position: 'sticky', left: 0, zIndex: 3 }}>
                Mã HV
              </TableCell>
              <TableCell sx={{ bgcolor: 'primary.light', minWidth: COL_TEN, position: 'sticky', left: COL_MA, zIndex: 3 }}>
                Học sinh
              </TableCell>
              {sessionGroups.map(([k]) => (
                <TableCell
                  key={k}
                  align="center"
                  sx={{
                    bgcolor: 'primary.light',
                    minWidth: SESSION_COL_PX,
                    width: SESSION_COL_PX,
                    maxWidth: SESSION_COL_PX,
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    py: 1,
                    px: 0.5,
                    fontSize: '0.7rem',
                    lineHeight: 1.25,
                  }}
                >
                  {k}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell colSpan={Math.max(sessionGroups.length + 2, 3)} align="center" sx={{ py: 4 }}>
                Đang tải dữ liệu...
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%', minWidth: 0, maxWidth: '100%' }}>
      <Box
        ref={parentRef}
        component="div"
        sx={{
          flex: 1,
          overflow: 'auto',
          maxHeight: 500,
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
        }}
      >
        <Box component="div" sx={{ minWidth: minW, width: minW }}>
          {/* Header cùng khối cuộn ngang với body; sticky top + sticky left 2 cột */}
          <Box
            component="div"
            sx={{
              display: 'flex',
              alignItems: 'stretch',
              minWidth: minW,
              width: minW,
              position: 'sticky',
              top: 0,
              zIndex: 4,
              bgcolor: 'primary.light',
            }}
          >
            <Box
              component="div"
              sx={{
                ...stickyHeaderFrozen,
                left: 0,
                flex: `0 0 ${COL_MA}px`,
                width: COL_MA,
                minWidth: COL_MA,
                py: 1,
                px: 1,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              Mã HV
            </Box>
            <Box
              component="div"
              sx={{
                ...stickyHeaderFrozen,
                left: COL_MA,
                flex: `0 0 ${COL_TEN}px`,
                width: COL_TEN,
                minWidth: COL_TEN,
                py: 1,
                px: 1,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              Học sinh
            </Box>
            {sessionGroups.map(([groupKey]) => (
              <Box
                key={groupKey}
                component="div"
                sx={{
                  flex: `0 0 ${SESSION_COL_PX}px`,
                  minWidth: SESSION_COL_PX,
                  width: SESSION_COL_PX,
                  py: 1,
                  px: 0.5,
                  fontSize: '0.7rem',
                  lineHeight: 1.25,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  boxSizing: 'border-box',
                  bgcolor: 'primary.light',
                }}
              >
                {groupKey}
              </Box>
            ))}
          </Box>

          {loading && rows.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={40} />
            </Box>
          ) : (
            <Box
              component="div"
              sx={{
                height: `${virtualizer.getTotalSize()}px`,
                width: minW,
                minWidth: minW,
                position: 'relative',
              }}
            >
              {virtualItems.map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;
                const rowKey =
                  row.type === 'separator' ? `sep-${virtualRow.key}` : `r-${row.student.id}-${row.classData.class.id}-${virtualRow.index}`;
                return (
                  <Box
                    key={virtualRow.key}
                    component="div"
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: minW,
                      minWidth: minW,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {renderRowContent(
                      row,
                      rowKey,
                      sessionGroups,
                      getCellKey,
                      getVal,
                      getNote,
                      selectedCells,
                      focusedCell,
                      cellRefs,
                      focusedCellRef,
                      setCellValue,
                      onKeyDown,
                      onCellClick,
                      setFocusedCell,
                      setSelectedCells,
                      setOpenDropdowns,
                      virtualRow.size
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </Box>
      {loading && rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
          Đang tải dữ liệu...
        </Typography>
      ) : null}
    </Box>
  );
}

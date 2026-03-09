import React, { useRef } from 'react';
import { Box, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { useVirtualizer } from '@tanstack/react-virtual';
import AttendanceCell from './AttendanceCell';

const ROW_HEIGHT = 40;
const SEPARATOR_HEIGHT = 2;

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
  openDropdowns,
  setOpenDropdowns,
  cellRefs,
  focusedCellRef,
  onKeyDown,
  onCellClick,
}) {
  const parentRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i]?.type === 'separator' ? SEPARATOR_HEIGHT : ROW_HEIGHT),
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();

  if (rows.length === 0 && !loading) {
    return (
      <TableContainer component={Paper} sx={{ maxHeight: 500, flex: 1, overflow: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ bgcolor: 'primary.light', minWidth: 80 }}>Mã HV</TableCell>
              <TableCell sx={{ bgcolor: 'primary.light', minWidth: 160 }}>Học sinh</TableCell>
              {sessionGroups.map(([k]) => (
                <TableCell key={k} align="center" sx={{ bgcolor: 'primary.light', minWidth: 60 }}>
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
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Table component="div" sx={{ width: '100%', tableLayout: 'auto', borderCollapse: 'collapse' }}>
        <TableHead component="div" sx={{ display: 'block', position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.paper' }}>
          <TableRow component="div" sx={{ display: 'flex' }}>
            <TableCell component="div" sx={{ flex: '0 0 80px', minWidth: 80, bgcolor: 'primary.light', py: 1, px: 1 }}>
              Mã HV
            </TableCell>
            <TableCell component="div" sx={{ flex: '0 0 160px', minWidth: 160, bgcolor: 'primary.light', py: 1, px: 1 }}>
              Học sinh
            </TableCell>
            {sessionGroups.map(([groupKey]) => (
              <TableCell
                key={groupKey}
                component="div"
                align="center"
                sx={{ flex: '0 0 60px', minWidth: 60, bgcolor: 'primary.light', py: 1, px: 1 }}
              >
                {groupKey}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
      </Table>
      <Box
        ref={parentRef}
        component="div"
        sx={{
          flex: 1,
          overflow: 'auto',
          maxHeight: 500,
        }}
      >
        {loading && rows.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 4, gap: 1 }}>
            <CircularProgress size={40} />
            <Typography variant="body2" color="text.secondary">
              Đang tải dữ liệu...
            </Typography>
          </Box>
        ) : (
          <Box
            component="div"
            sx={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;
              if (row.type === 'separator') {
                return (
                  <Box
                    key={`sep-${virtualRow.key}`}
                    component="div"
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                      height: SEPARATOR_HEIGHT,
                      bgcolor: 'grey.300',
                    }}
                  />
                );
              }
              const { student, classData } = row;
              return (
                <Box
                  key={virtualRow.key}
                  component="div"
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    display: 'flex',
                    alignItems: 'stretch',
                  }}
                >
                  <Box component="div" sx={{ flex: '0 0 80px', minWidth: 80, py: 0.5, px: 1, borderBottom: 1, borderColor: 'divider' }}>
                    {student.maHV}
                  </Box>
                  <Box component="div" sx={{ flex: '0 0 160px', minWidth: 160, py: 0.5, px: 1, borderBottom: 1, borderColor: 'divider' }}>
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
                            flex: '0 0 60px',
                            minWidth: 60,
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
                          flex: '0 0 60px',
                          minWidth: 60,
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
                          isOpen={openDropdowns.has(cellKey)}
                          cellRefs={cellRefs}
                          focusedCellRef={focusedCellRef}
                          onValChange={setCellValue}
                          onKeyDown={onKeyDown}
                          onCellClick={onCellClick}
                          setFocusedCell={setFocusedCell}
                          setSelectedCells={setSelectedCells}
                          setOpenDropdowns={setOpenDropdowns}
                          getCellKey={getCellKey}
                        />
                      </Box>
                    );
                  })}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Box>
  );
}

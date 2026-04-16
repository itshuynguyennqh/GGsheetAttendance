import { memo, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import SeatCell from './SeatCell';

function SmartSeatGrid({
  rows = 4,
  cols = 7,
  disabledSeats = [],
  seatAssignments = {},
  studentById,
  seatStatuses = {},
  attendanceByStudentId = {},
  pathSelection = [],
  pickedStudentId = null,
  onSeatTap,
}) {
  const disabledSet = useMemo(() => new Set(disabledSeats), [disabledSeats]);
  const pathMap = useMemo(() => {
    const m = new Map();
    pathSelection.forEach((p, i) => m.set(`${p.row}-${p.col}`, i + 1));
    return m;
  }, [pathSelection]);

  const allRows = useMemo(() => Array.from({ length: rows }, (_, i) => i), [rows]);
  const allCols = useMemo(() => Array.from({ length: cols }, (_, i) => i), [cols]);

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Sơ đồ lớp ({cols} cột × {rows} hàng)
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, minmax(64px, 1fr))`,
          gap: 0.75,
          overflowX: 'auto',
          pb: 1,
        }}
      >
        {allRows.map((r) =>
          allCols.map((c) => {
            const seatKey = `${r}-${c}`;
            const isDisabled = disabledSet.has(seatKey);
            const assignment = seatAssignments[seatKey];
            const student = assignment?.studentId != null
              ? studentById?.get(Number(assignment.studentId))
              : null;
            const attendanceRecord = student ? attendanceByStudentId[Number(student.id)] : undefined;
            const status = seatStatuses[seatKey]
              || (student ? 'assigned' : 'empty');
            const order = pathMap.get(seatKey);
            const isPickedHere = student && pickedStudentId != null && Number(student.id) === Number(pickedStudentId);
            const isPickTarget = pickedStudentId != null && !student && !isDisabled;

            return (
              <SeatCell
                key={seatKey}
                row={r}
                col={c}
                student={student}
                status={status}
                attendanceRecord={attendanceRecord}
                order={order}
                isPathSelected={pathMap.has(seatKey)}
                isPickTarget={isPickTarget}
                isPickedHere={isPickedHere}
                disabled={isDisabled}
                onTap={onSeatTap}
              />
            );
          })
        )}
      </Box>
    </Box>
  );
}

export default memo(SmartSeatGrid);

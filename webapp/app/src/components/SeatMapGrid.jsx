import { memo } from 'react';
import { Box, Typography } from '@mui/material';
import { useDroppable } from '@dnd-kit/core';

const DroppableSeat = memo(function DroppableSeat({ id, children }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: 'seat', seatKey: id.replace('seat-', '') } });
  return (
    <Box
      ref={setNodeRef}
      sx={{
        border: '1px dashed',
        borderColor: isOver ? 'primary.main' : 'grey.300',
        bgcolor: isOver ? 'primary.lighter' : 'background.paper',
        borderRadius: 1,
        minHeight: 54,
        px: 0.75,
        py: 0.5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background-color 0.12s ease-out, border-color 0.12s ease-out',
      }}
    >
      {children}
    </Box>
  );
});

export default function SeatMapGrid({ rows = 4, cols = 7, renderSeat }) {
  const allRows = Array.from({ length: rows }, (_, i) => i);
  const allCols = Array.from({ length: cols }, (_, i) => i);
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Sơ đồ ghế ({cols}x{rows})
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(110px, 1fr))`, gap: 1 }}>
        {allRows.map((r) => allCols.map((c) => {
          const seatKey = `${r}-${c}`;
          return (
            <DroppableSeat key={seatKey} id={`seat-${seatKey}`}>
              {renderSeat?.(seatKey, r, c)}
            </DroppableSeat>
          );
        }))}
      </Box>
    </Box>
  );
}


import { Box, Typography } from '@mui/material';
import { useDroppable } from '@dnd-kit/core';

export default function SeatMapStudentPool({ students = [], renderStudent }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool', data: { type: 'pool' } });
  return (
    <Box
      ref={setNodeRef}
      sx={{
        mt: 2,
        p: 1.5,
        border: '1px dashed',
        borderColor: isOver ? 'warning.main' : 'grey.300',
        bgcolor: isOver ? 'warning.lighter' : 'grey.50',
        borderRadius: 1.5,
      }}
    >
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Học sinh chưa xếp ghế ({students.length})
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {students.map((s) => renderStudent?.(s, 'pool'))}
      </Box>
    </Box>
  );
}


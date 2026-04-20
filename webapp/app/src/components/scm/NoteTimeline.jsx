import { useEffect, useState, memo } from 'react';
import {
  Box, Typography, Stack,
  CircularProgress, Paper,
} from '@mui/material';
import { studentNotesApi } from '../../api';

function NoteTimeline({ studentId, open }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !studentId) return;
    setLoading(true);
    studentNotesApi.timeline(studentId)
      .then((result) => setData(Array.isArray(result) ? result : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [open, studentId]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (data.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
        Chưa có ghi chú nào.
      </Typography>
    );
  }

  const grouped = {};
  data.forEach((note) => {
    const dateKey = note.ngayHoc || note.sessionDate || 'Không rõ ngày';
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(note);
  });

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
      {sortedDates.map((date) => (
        <Box key={date} sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5, position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1, py: 0.5 }}>
            {date}
          </Typography>
          <Stack spacing={0.5}>
            {grouped[date].map((note) => (
              <Paper
                key={`${note.id}-${note.type || 'unknown'}`} // Use a composite key for robustness
                variant="outlined"
                sx={{
                  px: 1.5,
                  py: 0.75,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  borderLeftWidth: 3,
                  borderLeftColor: note.type === 'positive' ? 'success.main'
                    : note.type === 'negative' ? 'error.main'
                    : 'grey.400',
                }}
              >
                {note.tagIcon && (
                  <Typography sx={{ fontSize: 16 }}>{note.tagIcon}</Typography>
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap>
                    {note.tagLabel || note.content || 'Ghi chú'}
                  </Typography>
                  {note.content && note.tagLabel && (
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {note.content}
                    </Typography>
                  )}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                  {note.createdAt ? new Date(note.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}
                </Typography>
              </Paper>
            ))}
          </Stack>
        </Box>
      ))}
    </Box>
  );
}

export default memo(NoteTimeline);

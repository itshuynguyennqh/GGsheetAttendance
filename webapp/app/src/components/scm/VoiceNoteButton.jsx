import { useState, useCallback, memo } from 'react';
import {
  Fab, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, Stack, Chip, Alert, CircularProgress,
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { findBestMatch } from '../../utils/fuzzyMatch';

function VoiceNoteButton({ students = [], sessionId, onNoteAdded }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [saving, setSaving] = useState(false);

  const speech = useSpeechRecognition({
    lang: 'vi-VN',
    continuous: true,
    onResult: (fullTranscript, latestChunk) => {
      if (!latestChunk) return;

      let studentName = '';
      let comment = '';

      const commaIdx = latestChunk.indexOf(',');
      if (commaIdx > 0) {
        studentName = latestChunk.substring(0, commaIdx).trim();
        comment = latestChunk.substring(commaIdx + 1).trim();
      } else {
        let bestLen = 0;
        for (const s of students) {
          const name = s.hoTen || s.name || '';
          if (!name) continue;
          const words = name.split(' ');
          const lastName = words[words.length - 1];
          if (latestChunk.toLowerCase().startsWith(lastName.toLowerCase())) {
            if (lastName.length > bestLen) {
              bestLen = lastName.length;
              studentName = lastName;
              comment = latestChunk.substring(lastName.length).trim();
            }
          }
        }
        if (!studentName) {
          const words = latestChunk.split(' ');
          if (words.length >= 2) {
            studentName = words.slice(0, 2).join(' ');
            comment = words.slice(2).join(' ');
          } else {
            studentName = latestChunk;
            comment = '';
          }
        }
      }

      const match = findBestMatch(studentName, students, 0.3);
      setResults(prev => [...prev, {
        raw: latestChunk,
        studentName,
        comment: comment || latestChunk,
        match,
        saved: false,
      }]);
    },
  });

  const handleOpen = useCallback(() => {
    setDialogOpen(true);
    setResults([]);
  }, []);

  const handleClose = useCallback(() => {
    speech.stop();
    setDialogOpen(false);
    setResults([]);
  }, [speech]);

  const handleSaveAll = useCallback(async () => {
    setSaving(true);
    const { studentNotesApi } = await import('../../api');
    let saved = 0;
    for (const r of results) {
      if (!r.match || r.saved) continue;
      try {
        await studentNotesApi.create({
          studentId: r.match.student.id,
          sessionId,
          content: r.comment || r.raw,
          type: 'neutral',
        });
        r.saved = true;
        saved++;
      } catch (e) {
        console.warn('Failed to save note:', e);
      }
    }
    setSaving(false);
    setResults([...results]);
    onNoteAdded?.(saved);
    if (saved > 0) {
      handleClose();
    }
  }, [results, sessionId, onNoteAdded, handleClose]);

  if (!speech.supported) return null;

  return (
    <>
      <Fab
        color="primary"
        size="medium"
        onClick={handleOpen}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1000,
        }}
      >
        <MicIcon />
      </Fab>

      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Ghi nhận xét bằng giọng nói</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Nói: "Tên học sinh, nhận xét". Ví dụ: "An, phát biểu hay" hoặc "Nguyễn Văn Bình, quên bài".
          </Typography>

          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <Fab
              color={speech.listening ? 'error' : 'primary'}
              onClick={speech.toggle}
              sx={{
                animation: speech.listening ? 'micPulse 1.5s ease-in-out infinite' : 'none',
                '@keyframes micPulse': {
                  '0%, 100%': { boxShadow: '0 0 0 0 rgba(211, 47, 47, 0.4)' },
                  '50%': { boxShadow: '0 0 0 12px rgba(211, 47, 47, 0)' },
                },
              }}
            >
              {speech.listening ? <MicOffIcon /> : <MicIcon />}
            </Fab>
          </Box>

          {speech.listening && (
            <Typography variant="body2" sx={{ textAlign: 'center', mb: 1, color: 'error.main', fontWeight: 600 }}>
              Đang nghe...
            </Typography>
          )}

          {speech.interimTranscript && (
            <Typography variant="caption" sx={{ textAlign: 'center', display: 'block', mb: 1, fontStyle: 'italic', color: 'text.secondary' }}>
              {speech.interimTranscript}
            </Typography>
          )}

          {results.length > 0 && (
            <Stack spacing={1} sx={{ mt: 1 }}>
              {results.map((r, i) => (
                <Box
                  key={i}
                  sx={{
                    p: 1.5,
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: r.match ? (r.saved ? 'success.main' : 'primary.main') : 'error.main',
                    bgcolor: r.saved ? 'success.50' : 'background.paper',
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    {r.match ? (
                      <Chip
                        label={r.match.student.hoTen || r.match.student.name}
                        size="small"
                        color={r.saved ? 'success' : 'primary'}
                        sx={{ fontWeight: 600 }}
                      />
                    ) : (
                      <Chip label="Không tìm thấy" size="small" color="error" />
                    )}
                    {r.match && (
                      <Chip
                        label={`${Math.round(r.match.score * 100)}%`}
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: 10 }}
                      />
                    )}
                    {r.saved && (
                      <Chip label="Đã lưu" size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: 10 }} />
                    )}
                  </Stack>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {r.comment || r.raw}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Gốc: "{r.raw}"
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}

          {results.length === 0 && !speech.listening && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              Nhấn nút mic để bắt đầu ghi âm
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Đóng</Button>
          <Button
            variant="contained"
            onClick={handleSaveAll}
            disabled={saving || results.filter(r => r.match && !r.saved).length === 0}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            Lưu {results.filter(r => r.match && !r.saved).length} nhận xét
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default memo(VoiceNoteButton);

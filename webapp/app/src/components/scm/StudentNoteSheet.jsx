import { useState, useCallback, memo } from 'react';
import {
  SwipeableDrawer, Box, Typography, Stack, TextField, Button,
  IconButton, Chip, Divider, Alert, Tabs, Tab,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import HistoryIcon from '@mui/icons-material/History';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import QuickTagBar from './QuickTagBar';
import NoteTimeline from './NoteTimeline';
import { useStudentNotes } from '../../hooks/useStudentNotes';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';

function StudentNoteSheet({ open, student, sessionId, onClose }) {
  const {
    notes, tags, summary, loading, error,
    addTagNote, addFreeNote, deleteNote,
  } = useStudentNotes({
    studentId: student?.id,
    sessionId,
  });

  const [freeText, setFreeText] = useState('');
  const [tab, setTab] = useState(0);

  const speech = useSpeechRecognition({
    lang: 'vi-VN',
    continuous: false,
    onEnd: (finalText) => {
      if (finalText?.trim()) {
        setFreeText(prev => prev ? prev + ' ' + finalText.trim() : finalText.trim());
      }
    },
  });

  const handleAddFreeNote = useCallback(async () => {
    if (!freeText.trim()) return;
    await addFreeNote(freeText.trim());
    setFreeText('');
  }, [freeText, addFreeNote]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddFreeNote();
    }
  }, [handleAddFreeNote]);

  const iOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      onOpen={() => {}}
      disableBackdropTransition={!iOS}
      disableDiscovery={iOS}
      sx={{
        '& .MuiDrawer-paper': {
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          maxHeight: '80vh',
        },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
        <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'grey.300' }} />
      </Box>

      <Box sx={{ px: 2, pb: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {student?.hoTen || student?.name || 'Học sinh'}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>

        {student?.maHV && (
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            Mã HV: {student.maHV}
          </Typography>
        )}

        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1 }}>
          <Tab label="Ghi chú" />
          <Tab label="Lịch sử" icon={<HistoryIcon sx={{ fontSize: 16 }} />} iconPosition="end" />
        </Tabs>

        {tab === 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5 }}>
              Ghi nhanh
            </Typography>
            <QuickTagBar tags={tags} summary={summary} onTagTap={addTagNote} loading={loading} />

            <Divider sx={{ my: 1.5 }} />

            <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
              <TextField
                size="small"
                fullWidth
                placeholder="Nhập ghi chú tự do..."
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              {speech.supported && (
                <IconButton
                  color={speech.listening ? 'error' : 'default'}
                  onClick={speech.toggle}
                  sx={speech.listening ? {
                    animation: 'micPulse 1.5s ease-in-out infinite',
                    '@keyframes micPulse': {
                      '0%, 100%': { boxShadow: '0 0 0 0 rgba(211, 47, 47, 0.4)' },
                      '50%': { boxShadow: '0 0 0 6px rgba(211, 47, 47, 0)' },
                    },
                  } : {}}
                >
                  {speech.listening ? <MicOffIcon /> : <MicIcon />}
                </IconButton>
              )}
              <IconButton color="primary" onClick={handleAddFreeNote} disabled={!freeText.trim()}>
                <SendIcon />
              </IconButton>
            </Stack>

            {speech.listening && speech.interimTranscript && (
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, fontStyle: 'italic' }}>
                🎤 {speech.interimTranscript}
              </Typography>
            )}

            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Ghi chú buổi này ({notes.length})
            </Typography>
            {notes.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Chưa có ghi chú nào.
              </Typography>
            ) : (
              <Stack spacing={0.5} sx={{ maxHeight: 250, overflow: 'auto' }}>
                {notes.map((note) => (
                  <Stack // Use a composite key for robustness
                    key={`${note.id}-${note.type || 'unknown'}`}
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{
                      px: 1,
                      py: 0.5,
                      borderRadius: 1,
                      bgcolor: note.type === 'positive' ? 'success.lighter'
                        : note.type === 'negative' ? 'error.lighter'
                        : 'grey.50',
                    }}
                  >
                    {note.tagIcon && <Typography sx={{ fontSize: 16 }}>{note.tagIcon}</Typography>}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap>
                        {note.tagLabel || note.content || 'Ghi chú'}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {note.createdAt ? new Date(note.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </Typography>
                    <IconButton size="small" onClick={() => deleteNote(note.id)} sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}>
                      <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            )}
          </>
        )}

        {tab === 1 && (
          <NoteTimeline studentId={student?.id} open={tab === 1} />
        )}
      </Box>
    </SwipeableDrawer>
  );
}

export default memo(StudentNoteSheet);

import { useCallback, useEffect, useState } from 'react';
import { noteTagsApi, studentNotesApi } from '../api';

export function useStudentNotes({ studentId, sessionId }) {
  const [notes, setNotes] = useState([]);
  const [tags, setTags] = useState([]);
  const [summary, setSummary] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadTags = useCallback(async () => {
    try {
      const data = await noteTagsApi.list();
      setTags(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Failed to load tags:', e);
    }
  }, []);

  const loadNotes = useCallback(async () => {
    if (!studentId || !sessionId) return;
    setLoading(true);
    try {
      const [notesData, summaryData] = await Promise.all([
        studentNotesApi.list({ studentId, sessionId }),
        studentNotesApi.summary({ studentId, sessionId }),
      ]);
      setNotes(Array.isArray(notesData) ? notesData : []);
      setSummary(Array.isArray(summaryData) ? summaryData : []);
    } catch (e) {
      setError(e.message || 'Lỗi tải ghi chú');
    } finally {
      setLoading(false);
    }
  }, [studentId, sessionId]);

  const loadTimeline = useCallback(async () => {
    if (!studentId) return;
    try {
      const data = await studentNotesApi.timeline(studentId);
      setTimeline(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Failed to load timeline:', e);
    }
  }, [studentId]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const addTagNote = useCallback(async (tagId) => {
    if (!studentId || !sessionId) return;
    try {
      await studentNotesApi.create({ studentId, sessionId, tagId });
      await loadNotes();
    } catch (e) {
      setError(e.message || 'Lỗi thêm ghi chú');
    }
  }, [studentId, sessionId, loadNotes]);

  const addFreeNote = useCallback(async (content, type = 'neutral') => {
    if (!studentId || !sessionId || !content?.trim()) return;
    try {
      await studentNotesApi.create({ studentId, sessionId, content, type });
      await loadNotes();
    } catch (e) {
      setError(e.message || 'Lỗi thêm ghi chú');
    }
  }, [studentId, sessionId, loadNotes]);

  const deleteNote = useCallback(async (noteId) => {
    try {
      await studentNotesApi.delete(noteId);
      await loadNotes();
    } catch (e) {
      setError(e.message || 'Lỗi xóa ghi chú');
    }
  }, [loadNotes]);

  return {
    notes, tags, summary, timeline, loading, error,
    addTagNote, addFreeNote, deleteNote,
    loadTimeline, loadNotes, loadTags,
  };
}

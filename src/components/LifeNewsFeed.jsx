import React, { useState } from 'react';
import { Newspaper, Search, Filter, ArrowUpRight, ArrowDownRight, Tag, Trash2, Pencil, Save, X } from 'lucide-react';

export function LifeNewsFeed({ events, onClearEvents, onDeleteSingleEvent, onEditEvent }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [sentimentFilter, setSentimentFilter] = useState('ALL');
  const [editingEventId, setEditingEventId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);
  const [editError, setEditError] = useState('');

  if (!events) return null;

  const startEditing = (evt) => {
    setEditingEventId(evt.id);
    setEditTitle(evt.title);
    setEditDescription(evt.description || '');
    setEditError('');
  };

  const cancelEditing = () => {
    setEditingEventId(null);
    setEditError('');
  };

  const saveEditing = async (event, eventId) => {
    event.preventDefault();
    const title = editTitle.trim();
    if (!title) return;

    setSavingEvent(true);
    setEditError('');
    try {
      await onEditEvent(eventId, { title, description: editDescription });
      setEditingEventId(null);
    } catch (error) {
      setEditError(error.message || 'Unable to save event details.');
    } finally {
      setSavingEvent(false);
    }
  };

  const filtered = events.filter((evt) => {
    const matchesSearch = evt.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (evt.description && evt.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesSector = sectorFilter === 'ALL' || evt.sector === sectorFilter;
    const matchesSentiment = sentimentFilter === 'ALL' || evt.sentiment === sentimentFilter;
    return matchesSearch && matchesSector && matchesSentiment;
  });

  return (
    <div className="bg-white border border-[#E2E0D8] rounded-2xl p-5 shadow-sm">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
            <Newspaper className="w-5 h-5 text-emerald-600" />
            <span>Human Life Events Newsfeed</span>
          </h2>
          <p className="text-xs text-slate-500">Chronological ledger of real-life catalysts impacting stock valuation</p>
        </div>

        {/* Filter Controls & Clear Button */}
        <div className="flex flex-wrap items-center gap-2">
          {events.length > 0 && (
            <button
              onClick={onClearEvents}
              className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs px-2.5 py-2 rounded-xl flex items-center space-x-1.5 transition-colors font-medium"
              title="Delete all news feed events"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All Events</span>
            </button>
          )}

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search life events..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#F7F6F1] border border-[#E2E0D8] text-xs text-slate-800 placeholder-slate-400 rounded-xl pl-8 pr-3 py-2 outline-none focus:border-blue-500"
            />
          </div>

          {/* Sector Select */}
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="bg-[#F7F6F1] border border-[#E2E0D8] text-xs text-slate-700 rounded-xl px-3 py-2 outline-none cursor-pointer"
          >
            <option value="ALL">All Sectors</option>
            <option value="Career">Career</option>
            <option value="Education">Education</option>
            <option value="Skills">Skills</option>
            <option value="Projects">Projects</option>
            <option value="Finance">Finance</option>
            <option value="Social">Social</option>
            <option value="Wellbeing">Wellbeing</option>
          </select>

          {/* Sentiment Filter */}
          <select
            value={sentimentFilter}
            onChange={(e) => setSentimentFilter(e.target.value)}
            className="bg-[#F7F6F1] border border-[#E2E0D8] text-xs text-slate-700 rounded-xl px-3 py-2 outline-none cursor-pointer"
          >
            <option value="ALL">All Sentiment</option>
            <option value="POSITIVE">Positive 📈</option>
            <option value="NEGATIVE">Negative 📉</option>
          </select>
        </div>
      </div>

      {/* Events List */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
        {filtered.length > 0 ? (
          filtered.map((evt) => {
            const isPos = evt.impactPercent >= 0;
            const isEditing = editingEventId === evt.id;
            const dateStr = new Date(evt.timestamp).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });

            return (
              <div
                key={evt.id}
                className="bg-[#F7F6F1] border border-[#E2E0D8] hover:border-blue-400 rounded-xl p-4 transition-all group relative"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  
                  {/* Event Information */}
                  <div className="flex-1 pr-2">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      {/* Sentiment Badge */}
                      <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md flex items-center ${
                        isPos
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                          : 'bg-rose-100 text-rose-700 border border-rose-300'
                      }`}>
                        {isPos ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                        {isPos ? '+' : ''}{evt.impactPercent}%
                      </span>

                      {/* Sector Badge */}
                      <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 border border-blue-200">
                        {evt.sector}
                      </span>

                      {/* AI Confidence */}
                      <span className="text-[10px] font-mono text-slate-500">
                        AI Confidence: <strong className="text-slate-700">{evt.confidence}%</strong>
                      </span>

                      <span className="text-[10px] font-mono text-slate-400 ml-auto">
                        {dateStr}
                      </span>
                    </div>

                    {isEditing ? (
                      <form
                        onSubmit={(event) => saveEditing(event, evt.id)}
                        className="space-y-2"
                      >
                        <input
                          type="text"
                          aria-label="Event title"
                          required
                          maxLength={200}
                          value={editTitle}
                          onChange={(event) => setEditTitle(event.target.value)}
                          className="w-full bg-white border border-[#E2E0D8] rounded-lg px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                        />
                        <textarea
                          aria-label="Event description"
                          rows={3}
                          maxLength={2000}
                          value={editDescription}
                          onChange={(event) => setEditDescription(event.target.value)}
                          className="w-full bg-white border border-[#E2E0D8] rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-500 resize-y"
                        />
                        {editError && <p role="alert" className="text-xs text-rose-600">{editError}</p>}
                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            disabled={savingEvent || !editTitle.trim()}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                          >
                            <Save className="w-3.5 h-3.5" />
                            Save
                          </button>
                          <button
                            type="button"
                            disabled={savingEvent}
                            onClick={cancelEditing}
                            className="bg-white border border-[#E2E0D8] hover:bg-slate-50 text-slate-600 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                          >
                            <X className="w-3.5 h-3.5" />
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <h4 className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                          {evt.title}
                        </h4>
                        {evt.description && (
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                            {evt.description}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Price Movement Box & Event Actions */}
                  <div className="flex items-center space-x-2 self-start">
                    <div className="bg-white border border-[#E2E0D8] px-3 py-2 rounded-xl text-right font-mono min-w-[110px]">
                      <span className="text-[10px] text-slate-400 block">PRICE IMPACT</span>
                      <div className="text-xs font-bold text-slate-500">
                        ₹{evt.previousPrice?.toFixed(2)} ➔
                      </div>
                      <div className={`text-sm font-extrabold ${isPos ? 'text-emerald-600' : 'text-rose-500'}`}>
                        ₹{evt.newPrice?.toFixed(2)}
                      </div>
                    </div>

                    <button
                      onClick={() => startEditing(evt)}
                      disabled={savingEvent}
                      className="p-2 text-slate-400 hover:text-blue-600 bg-white hover:bg-blue-50 border border-[#E2E0D8] hover:border-blue-200 rounded-xl transition-all disabled:opacity-50"
                      title="Edit event title and description"
                      aria-label={`Edit ${evt.title}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => onDeleteSingleEvent && onDeleteSingleEvent(evt.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 bg-white hover:bg-rose-50 border border-[#E2E0D8] hover:border-rose-200 rounded-xl transition-all"
                      title="Delete this news event"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-xs text-slate-400">
            No life events match the selected filters.
          </div>
        )}
      </div>

    </div>
  );
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { Building2, Mail, Phone, Globe, Calendar, Check, Eye, EyeOff, Trash2, MessageSquare, ExternalLink } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../providers/AuthProvider';

type EnterpriseContact = {
  id: string;
  email: string;
  phone: string | null;
  name: string;
  companyName: string | null;
  website: string | null;
  message: string | null;
  source: string | null;
  readAt: string | null;
  processedAt: string | null;
  notes: string | null;
  createdAt: string;
};

const OwnerEnterpriseContactsPage = () => {
  const { isOwner } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'unread' | 'read' | 'processed'>('all');
  const [selectedContact, setSelectedContact] = useState<EnterpriseContact | null>(null);
  const [notesInput, setNotesInput] = useState('');

  const contactsQuery = useQuery<EnterpriseContact[]>({
    queryKey: ['ownerEnterpriseContacts'],
    queryFn: async () => {
      const { data } = await api.get('/owner/enterprise-contacts');
      return data;
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/owner/enterprise-contacts/${id}/mark-read`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ownerEnterpriseContacts'] });
    },
  });

  const processMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const { data } = await api.post(`/owner/enterprise-contacts/${id}/process`, { notes });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ownerEnterpriseContacts'] });
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { data } = await api.put(`/owner/enterprise-contacts/${id}/notes`, { notes });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ownerEnterpriseContacts'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/owner/enterprise-contacts/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ownerEnterpriseContacts'] });
      setSelectedContact(null);
    },
  });

  const filteredContacts = useMemo(() => {
    const contacts = contactsQuery.data ?? [];
    return contacts.filter((contact) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (contact.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);

      let matchesStatus = true;
      if (filterStatus === 'unread') {
        matchesStatus = !contact.readAt;
      } else if (filterStatus === 'read') {
        matchesStatus = !!contact.readAt && !contact.processedAt;
      } else if (filterStatus === 'processed') {
        matchesStatus = !!contact.processedAt;
      }

      return matchesSearch && matchesStatus;
    });
  }, [contactsQuery.data, searchQuery, filterStatus]);

  const unreadCount = useMemo(() => {
    return (contactsQuery.data ?? []).filter((c) => !c.readAt).length;
  }, [contactsQuery.data]);

  if (!isOwner) {
    return <p className="text-slate-400">Only owner accounts can access this page.</p>;
  }

  const handleSelectContact = (contact: EnterpriseContact) => {
    setSelectedContact(contact);
    setNotesInput(contact.notes ?? '');
    if (!contact.readAt) {
      markReadMutation.mutate(contact.id);
    }
  };

  return (
    <section className="space-y-6 text-slate-100">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Owner</p>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-semibold text-white">Enterprise Inquiries</h1>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-indigo-500 px-2.5 py-0.5 text-xs font-bold text-white">
              {unreadCount} new
            </span>
          )}
        </div>
        <p className="text-sm text-slate-400">
          Manage enterprise contact requests from the pricing page.
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, email, or company..."
          className="flex-1 min-w-[200px] rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="all">All Inquiries</option>
          <option value="unread">Unread</option>
          <option value="read">Read (Not Processed)</option>
          <option value="processed">Processed</option>
        </select>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Contact List */}
        <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
          {contactsQuery.isLoading ? (
            <p className="text-sm text-slate-400">Loading contacts...</p>
          ) : filteredContacts.length === 0 ? (
            <div className="py-12 text-center">
              <Building2 className="mx-auto h-12 w-12 text-slate-600" />
              <p className="mt-4 text-sm text-slate-400">No enterprise inquiries found</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="mb-4 text-sm text-slate-400">
                Showing {filteredContacts.length} of {contactsQuery.data?.length ?? 0} inquiries
              </div>
              {filteredContacts.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => handleSelectContact(contact)}
                  className={`w-full rounded-2xl border p-4 text-left transition-all ${
                    selectedContact?.id === contact.id
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : !contact.readAt
                      ? 'border-indigo-400/30 bg-indigo-500/5 hover:bg-indigo-500/10'
                      : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {!contact.readAt && (
                          <span className="h-2 w-2 rounded-full bg-indigo-400" />
                        )}
                        <span className="font-semibold text-white truncate">
                          {contact.companyName || contact.name}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-400 truncate">{contact.email}</p>
                      {contact.message && (
                        <p className="mt-2 text-xs text-slate-500 line-clamp-2">{contact.message}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-slate-500">
                        {new Date(contact.createdAt).toLocaleDateString()}
                      </span>
                      {contact.processedAt && (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
                          <Check className="mr-1 h-3 w-3" />
                          Processed
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Contact Details */}
        <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
          {selectedContact ? (
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    {selectedContact.companyName || selectedContact.name}
                  </h2>
                  <p className="text-sm text-slate-400">{selectedContact.name}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => markReadMutation.mutate(selectedContact.id)}
                    className="rounded-xl border border-white/10 p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
                    title={selectedContact.readAt ? 'Mark as unread' : 'Mark as read'}
                  >
                    {selectedContact.readAt ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this inquiry?')) {
                        deleteMutation.mutate(selectedContact.id);
                      }
                    }}
                    className="rounded-xl border border-white/10 p-2 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-slate-500" />
                  <a
                    href={`mailto:${selectedContact.email}`}
                    className="text-indigo-400 hover:underline"
                  >
                    {selectedContact.email}
                  </a>
                </div>

                {selectedContact.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-slate-500" />
                    <a
                      href={`tel:${selectedContact.phone}`}
                      className="text-slate-300 hover:text-white"
                    >
                      {selectedContact.phone}
                    </a>
                  </div>
                )}

                {selectedContact.website && (
                  <div className="flex items-center gap-3 text-sm">
                    <Globe className="h-4 w-4 text-slate-500" />
                    <a
                      href={selectedContact.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      {selectedContact.website}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}

                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="h-4 w-4 text-slate-500" />
                  <span className="text-slate-300">
                    Submitted {new Date(selectedContact.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {selectedContact.message && (
                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    <MessageSquare className="h-3 w-3" />
                    Message
                  </div>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{selectedContact.message}</p>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Internal Notes
                </label>
                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="Add notes about this inquiry..."
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  rows={3}
                />
                {notesInput !== (selectedContact.notes ?? '') && (
                  <button
                    onClick={() => updateNotesMutation.mutate({ id: selectedContact.id, notes: notesInput })}
                    disabled={updateNotesMutation.isPending}
                    className="mt-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition disabled:opacity-50"
                  >
                    {updateNotesMutation.isPending ? 'Saving...' : 'Save Notes'}
                  </button>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-white/10">
                <a
                  href={`mailto:${selectedContact.email}?subject=Re: Enterprise Inquiry - Advideolab`}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition"
                >
                  <Mail className="h-4 w-4" />
                  Send Email
                </a>
                <button
                  onClick={() => processMutation.mutate({ id: selectedContact.id, notes: notesInput })}
                  disabled={processMutation.isPending}
                  className={`flex-1 inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition disabled:opacity-50 ${
                    selectedContact.processedAt
                      ? 'border border-white/10 text-slate-300 hover:bg-white/10'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
                  }`}
                >
                  <Check className="h-4 w-4" />
                  {selectedContact.processedAt ? 'Mark Unprocessed' : 'Mark Processed'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center">
              <div className="text-center">
                <Building2 className="mx-auto h-12 w-12 text-slate-600" />
                <p className="mt-4 text-sm text-slate-400">
                  Select an inquiry to view details
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default OwnerEnterpriseContactsPage;

"use client";

import { useState, useMemo } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  RefreshCw,
  User,
  Clock,
  ArrowRightLeft,
} from "lucide-react";
import { OnCallSchedule, DeveloperBrief, TeamMember } from "@/lib/api";

interface OnCallScheduleEditorProps {
  schedules: OnCallSchedule[];
  teamMembers: TeamMember[];
  currentUserId: string;
  isAdmin: boolean;
  onCreateSchedule: (schedule: { developer_id: string; start_time: string; end_time: string }) => Promise<void>;
  onDeleteSchedule: (scheduleId: string) => Promise<void>;
  onRequestSwap: (scheduleId: string, targetId: string, message?: string) => Promise<void>;
  isCreating: boolean;
  isDeleting: boolean;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Add days from previous month to fill the first week
  const firstDayOfWeek = firstDay.getDay();
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push(d);
  }

  // Add days of current month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }

  // Add days from next month to complete the last week
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i));
    }
  }

  return days;
}

function getScheduleForDay(schedules: OnCallSchedule[], date: Date): OnCallSchedule | null {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  return (
    schedules.find((s) => {
      const start = new Date(s.start_time);
      const end = new Date(s.end_time);
      return start <= dayEnd && end >= dayStart;
    }) || null
  );
}

function getMemberColor(memberId: string, members: TeamMember[]): string {
  const colors = [
    "bg-blue-600",
    "bg-green-600",
    "bg-purple-600",
    "bg-amber-600",
    "bg-pink-600",
    "bg-cyan-600",
    "bg-red-600",
    "bg-indigo-600",
  ];
  const index = members.findIndex((m) => m.developer_id === memberId);
  return colors[index % colors.length];
}

interface CreateScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamMembers: TeamMember[];
  onSubmit: (data: { developer_id: string; start_time: string; end_time: string }) => Promise<void>;
  isCreating: boolean;
  initialDate?: Date;
}

function CreateScheduleModal({
  isOpen,
  onClose,
  teamMembers,
  onSubmit,
  isCreating,
  initialDate,
}: CreateScheduleModalProps) {
  const [developerId, setDeveloperId] = useState("");
  const [startDate, setStartDate] = useState(
    initialDate ? initialDate.toISOString().split("T")[0] : new Date().toISOString().split("T")[0]
  );
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState(
    initialDate
      ? new Date(initialDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [endTime, setEndTime] = useState("09:00");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!developerId) return;

    const startDateTime = new Date(`${startDate}T${startTime}:00`);
    const endDateTime = new Date(`${endDate}T${endTime}:00`);

    await onSubmit({
      developer_id: developerId,
      start_time: startDateTime.toISOString(),
      end_time: endDateTime.toISOString(),
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-muted rounded-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-foreground mb-4">Create On-Call Schedule</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Team Member</label>
            <select
              value={developerId}
              onChange={(e) => setDeveloperId(e.target.value)}
              className="w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select a member...</option>
              {teamMembers.map((member) => (
                <option key={member.developer_id} value={member.developer_id}>
                  {member.developer_name || member.developer_email}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-accent text-foreground rounded-lg hover:bg-muted transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !developerId}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {isCreating ? "Creating..." : "Create Schedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface SwapRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: OnCallSchedule;
  teamMembers: TeamMember[];
  currentUserId: string;
  onSubmit: (targetId: string, message?: string) => Promise<void>;
  isSubmitting: boolean;
}

function SwapRequestModal({
  isOpen,
  onClose,
  schedule,
  teamMembers,
  currentUserId,
  onSubmit,
  isSubmitting,
}: SwapRequestModalProps) {
  const [targetId, setTargetId] = useState("");
  const [message, setMessage] = useState("");

  if (!isOpen) return null;

  const availableMembers = teamMembers.filter(
    (m) => m.developer_id !== currentUserId && m.developer_id !== schedule.developer_id
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId) return;
    await onSubmit(targetId, message || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-muted rounded-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-foreground mb-4">Request Swap</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Request to swap your on-call shift with another team member.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Swap with</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select a member...</option>
              {availableMembers.map((member) => (
                <option key={member.developer_id} value={member.developer_id}>
                  {member.developer_name || member.developer_email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Message (optional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Why do you need to swap?"
              className="w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-accent text-foreground rounded-lg hover:bg-muted transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !targetId}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {isSubmitting ? "Sending..." : "Send Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function OnCallScheduleEditor({
  schedules,
  teamMembers,
  currentUserId,
  isAdmin,
  onCreateSchedule,
  onDeleteSchedule,
  onRequestSwap,
  isCreating,
  isDeleting,
}: OnCallScheduleEditorProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<OnCallSchedule | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleDayClick = (date: Date) => {
    const schedule = getScheduleForDay(schedules, date);
    if (schedule) {
      setSelectedSchedule(schedule);
    } else if (isAdmin) {
      setSelectedDate(date);
      setShowCreateModal(true);
    }
  };

  const handleSwapRequest = (schedule: OnCallSchedule) => {
    setSelectedSchedule(schedule);
    setShowSwapModal(true);
  };

  return (
    <div className="space-y-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">
            {MONTHS[month]} {year}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevMonth}
            className="p-2 hover:bg-accent rounded-lg transition"
          >
            <ChevronLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <button
            onClick={goToNextMonth}
            className="p-2 hover:bg-accent rounded-lg transition"
          >
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
          {isAdmin && (
            <button
              onClick={() => {
                setSelectedDate(new Date());
                setShowCreateModal(true);
              }}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <Plus className="h-4 w-4" />
              Add Schedule
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {teamMembers.map((member) => (
          <div key={member.developer_id} className="flex items-center gap-2 text-sm">
            <div className={`w-3 h-3 rounded ${getMemberColor(member.developer_id, teamMembers)}`} />
            <span className="text-muted-foreground">{member.developer_name || member.developer_email}</span>
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="bg-muted rounded-xl overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-accent/50">
          {DAYS.map((day) => (
            <div key={day} className="py-2 text-center text-sm font-medium text-muted-foreground">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="grid grid-cols-7">
          {days.map((date, index) => {
            const isCurrentMonth = date.getMonth() === month;
            const isToday = date.toDateString() === today.toDateString();
            const schedule = getScheduleForDay(schedules, date);
            const isPast = date < today;

            return (
              <div
                key={index}
                onClick={() => handleDayClick(date)}
                className={`
                  min-h-[80px] p-2 border-t border-border cursor-pointer transition
                  ${isCurrentMonth ? "bg-muted" : "bg-muted/50"}
                  ${isToday ? "ring-2 ring-blue-500 ring-inset" : ""}
                  hover:bg-accent/50
                `}
              >
                <div className="flex items-start justify-between">
                  <span
                    className={`
                      text-sm font-medium
                      ${isCurrentMonth ? "text-foreground" : "text-muted-foreground"}
                      ${isToday ? "text-blue-400" : ""}
                    `}
                  >
                    {date.getDate()}
                  </span>
                </div>
                {schedule && (
                  <div
                    className={`
                      mt-1 p-1.5 rounded text-xs truncate
                      ${getMemberColor(schedule.developer_id, teamMembers)}
                      ${schedule.is_override ? "ring-2 ring-amber-400" : ""}
                    `}
                    title={schedule.developer?.name || schedule.developer?.email || "Unknown"}
                  >
                    <span className="text-foreground font-medium">
                      {schedule.developer?.name?.split(" ")[0] ||
                        schedule.developer?.email?.split("@")[0] ||
                        "Unknown"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Schedule Details */}
      {selectedSchedule && !showSwapModal && (
        <div className="bg-muted rounded-xl p-4 border border-border">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${getMemberColor(
                  selectedSchedule.developer_id,
                  teamMembers
                )}`}
              >
                <User className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <h4 className="font-medium text-foreground">
                  {selectedSchedule.developer?.name || selectedSchedule.developer?.email}
                </h4>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>
                    {new Date(selectedSchedule.start_time).toLocaleDateString()} -{" "}
                    {new Date(selectedSchedule.end_time).toLocaleDateString()}
                  </span>
                </div>
                {selectedSchedule.is_override && (
                  <div className="text-xs text-amber-400 mt-1">
                    Override from: {selectedSchedule.original_developer?.name || "Unknown"}
                    {selectedSchedule.override_reason && ` - ${selectedSchedule.override_reason}`}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {selectedSchedule.developer_id === currentUserId && (
                <button
                  onClick={() => handleSwapRequest(selectedSchedule)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-foreground rounded-lg hover:bg-muted transition text-sm"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  Request Swap
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => onDeleteSchedule(selectedSchedule.id)}
                  disabled={isDeleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition text-sm"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              )}
              <button
                onClick={() => setSelectedSchedule(null)}
                className="px-3 py-1.5 bg-accent text-foreground rounded-lg hover:bg-muted transition text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Schedule Modal */}
      <CreateScheduleModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setSelectedDate(null);
        }}
        teamMembers={teamMembers}
        onSubmit={onCreateSchedule}
        isCreating={isCreating}
        initialDate={selectedDate || undefined}
      />

      {/* Swap Request Modal */}
      {selectedSchedule && (
        <SwapRequestModal
          isOpen={showSwapModal}
          onClose={() => {
            setShowSwapModal(false);
            setSelectedSchedule(null);
          }}
          schedule={selectedSchedule}
          teamMembers={teamMembers}
          currentUserId={currentUserId}
          onSubmit={(targetId, message) => onRequestSwap(selectedSchedule.id, targetId, message)}
          isSubmitting={false}
        />
      )}
    </div>
  );
}

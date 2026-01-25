"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { publicBookingApi, TimeSlot, CustomQuestion } from "@/lib/booking-api";
import { format, parseISO, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isBefore, startOfDay, isToday } from "date-fns";
import { toast } from "sonner";
import {
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Video,
  MapPin,
  Phone,
  User,
  Check,
  Users,
} from "lucide-react";

interface EventTypePublic {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  location_type: string;
  color: string;
  questions: CustomQuestion[];
  payment_enabled: boolean;
  payment_amount: number | null;
  payment_currency: string;
  host_name: string | null;
  host_avatar_url: string | null;
}

interface TeamMember {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface TeamInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  members: TeamMember[];
}

export default function TeamBookingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const workspaceSlug = params.workspaceSlug as string;
  const eventSlug = params.eventSlug as string;
  const teamId = params.teamId as string;

  // Support for custom member selection via query params
  const memberIds = searchParams.get("members")?.split(",").filter(Boolean) || [];

  const [eventType, setEventType] = useState<EventTypePublic | null>(null);
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [step, setStep] = useState<"date" | "details" | "confirmed">("date");
  const [booking, setBooking] = useState(false);
  const [timezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    answers: {} as Record<string, any>,
  });

  const [confirmation, setConfirmation] = useState<any>(null);

  useEffect(() => {
    loadEventTypeAndTeam();
  }, [workspaceSlug, eventSlug, teamId]);

  useEffect(() => {
    if (selectedDate && eventType) {
      loadSlots(selectedDate);
    }
  }, [selectedDate, eventType]);

  const loadEventTypeAndTeam = async () => {
    try {
      // Load event type
      const eventData = await publicBookingApi.getEventType(workspaceSlug, eventSlug);
      setEventType(eventData);

      // Load team info
      const teamData = await publicBookingApi.getTeamInfo(workspaceSlug, teamId);
      setTeam(teamData);
    } catch (error: any) {
      if (error.response?.status === 404) {
        toast.error("Event or team not found");
      } else {
        toast.error("Failed to load booking page");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadSlots = async (date: Date) => {
    if (!eventType) return;

    setLoadingSlots(true);
    try {
      // Get slots filtered by team availability
      const data = await publicBookingApi.getTeamAvailableSlots(
        workspaceSlug,
        eventSlug,
        format(date, "yyyy-MM-dd"),
        timezone,
        teamId,
        memberIds.length > 0 ? memberIds : undefined
      );
      setSlots(data.slots.filter((s) => s.available));
    } catch (error) {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setSelectedSlot(null);
  };

  const handleSlotSelect = (slot: TimeSlot) => {
    setSelectedSlot(slot);
    setStep("details");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSlot || !eventType) return;

    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }

    if (!formData.email.trim()) {
      toast.error("Email is required");
      return;
    }

    setBooking(true);

    try {
      const result = await publicBookingApi.createTeamBooking(workspaceSlug, eventSlug, {
        start_time: selectedSlot.start_time,
        timezone,
        name: formData.name,
        email: formData.email,
        phone: formData.phone || undefined,
        answers: formData.answers,
        team_id: teamId,
        member_ids: memberIds.length > 0 ? memberIds : undefined,
      });

      setConfirmation(result);
      setStep("confirmed");
    } catch (error: any) {
      if (error.response?.status === 409) {
        toast.error("This time slot is no longer available");
        setStep("date");
        setSelectedSlot(null);
      } else {
        toast.error("Failed to book. Please try again.");
      }
    } finally {
      setBooking(false);
    }
  };

  const getLocationIcon = (locationType: string) => {
    switch (locationType) {
      case "zoom":
      case "google_meet":
      case "microsoft_teams":
        return <Video className="h-4 w-4" />;
      case "phone":
        return <Phone className="h-4 w-4" />;
      case "in_person":
        return <MapPin className="h-4 w-4" />;
      default:
        return <Video className="h-4 w-4" />;
    }
  };

  const getLocationLabel = (locationType: string) => {
    switch (locationType) {
      case "zoom": return "Zoom";
      case "google_meet": return "Google Meet";
      case "microsoft_teams": return "Microsoft Teams";
      case "phone": return "Phone Call";
      case "in_person": return "In Person";
      default: return "Video Call";
    }
  };

  // Calendar helpers
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = monthStart.getDay();
  const paddingDays = Array(startDayOfWeek).fill(null);

  // Get members to display (filtered if member_ids specified)
  const displayMembers = team?.members.filter(m =>
    memberIds.length === 0 || memberIds.includes(m.id)
  ) || [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!eventType || !team) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Not Found
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            This booking page doesn&apos;t exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
          {step === "confirmed" ? (
            // Confirmation Screen
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Booking Confirmed!
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                A confirmation email has been sent to {confirmation?.invitee_email}
              </p>

              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6 text-left max-w-md mx-auto">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
                  {confirmation?.event_name}
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                    <Calendar className="h-4 w-4" />
                    {format(parseISO(confirmation?.start_time), "EEEE, MMMM d, yyyy")}
                  </div>
                  <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                    <Clock className="h-4 w-4" />
                    {format(parseISO(confirmation?.start_time), "h:mm a")} - {format(parseISO(confirmation?.end_time), "h:mm a")}
                  </div>
                  <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                    <Users className="h-4 w-4" />
                    Team: {team.name}
                  </div>
                </div>

                {confirmation?.meeting_link && (
                  <a
                    href={confirmation.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 block w-full px-4 py-2 text-center text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                  >
                    Join Meeting
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="md:flex">
              {/* Event Info Sidebar */}
              <div className="md:w-80 p-6 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700">
                <div
                  className="w-2 h-16 rounded-full mb-4"
                  style={{ backgroundColor: eventType.color }}
                />
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  {eventType.name}
                </h1>

                {/* Team Badge */}
                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm">
                  <Users className="h-4 w-4" />
                  Team: {team.name}
                </div>

                <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {eventType.duration_minutes} minutes
                  </div>
                  <div className="flex items-center gap-2">
                    {getLocationIcon(eventType.location_type)}
                    {getLocationLabel(eventType.location_type)}
                  </div>
                </div>

                {eventType.description && (
                  <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                    {eventType.description}
                  </p>
                )}

                {/* Team Members */}
                {displayMembers.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Team Members
                    </h4>
                    <div className="space-y-2">
                      {displayMembers.slice(0, 5).map((member) => (
                        <div key={member.id} className="flex items-center gap-2">
                          {member.avatar_url ? (
                            <img
                              src={member.avatar_url}
                              alt={member.name || ""}
                              className="w-6 h-6 rounded-full"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                              <User className="h-3 w-3 text-gray-500" />
                            </div>
                          )}
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {member.name || member.email}
                          </span>
                        </div>
                      ))}
                      {displayMembers.length > 5 && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          +{displayMembers.length - 5} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {eventType.payment_enabled && eventType.payment_amount && (
                  <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <span className="text-lg font-bold text-gray-900 dark:text-white">
                      ${(eventType.payment_amount / 100).toFixed(2)}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 ml-1">
                      {eventType.payment_currency}
                    </span>
                  </div>
                )}
              </div>

              {/* Main Content */}
              <div className="flex-1 p-6">
                {step === "date" && (
                  <>
                    {/* Calendar */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="font-semibold text-gray-900 dark:text-white">
                          {format(currentMonth, "MMMM yyyy")}
                        </h2>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setCurrentMonth(addDays(currentMonth, -30))}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => setCurrentMonth(addDays(currentMonth, 30))}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-7 gap-1 text-center text-sm mb-2">
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                          <div key={day} className="text-gray-500 dark:text-gray-400 py-2">
                            {day}
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-7 gap-1">
                        {paddingDays.map((_, i) => (
                          <div key={`pad-${i}`} />
                        ))}
                        {calendarDays.map((day) => {
                          const isPastDay = isBefore(day, startOfDay(new Date()));
                          const isSelected = selectedDate && format(selectedDate, "yyyy-MM-dd") === format(day, "yyyy-MM-dd");

                          return (
                            <button
                              key={day.toISOString()}
                              onClick={() => !isPastDay && handleDateSelect(day)}
                              disabled={isPastDay}
                              className={`
                                p-2 text-sm rounded-lg
                                ${isPastDay ? "text-gray-300 dark:text-gray-600 cursor-not-allowed" : "hover:bg-blue-50 dark:hover:bg-blue-900/30"}
                                ${isSelected ? "bg-blue-600 text-white hover:bg-blue-700" : ""}
                                ${isToday(day) && !isSelected ? "font-bold text-blue-600" : ""}
                              `}
                            >
                              {format(day, "d")}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Time Slots */}
                    {selectedDate && (
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                          {format(selectedDate, "EEEE, MMMM d")}
                        </h3>

                        {loadingSlots ? (
                          <div className="text-center py-8 text-gray-500">Loading times...</div>
                        ) : slots.length === 0 ? (
                          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            No available times when all team members are free
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                            {slots.map((slot) => (
                              <button
                                key={slot.start_time}
                                onClick={() => handleSlotSelect(slot)}
                                className="px-3 py-2 text-sm border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-colors"
                              >
                                {format(parseISO(slot.start_time), "h:mm a")}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {step === "details" && selectedSlot && (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {format(parseISO(selectedSlot.start_time), "EEEE, MMMM d")}
                      </div>
                      <div className="text-gray-500 dark:text-gray-400">
                        {format(parseISO(selectedSlot.start_time), "h:mm a")} ({timezone})
                      </div>
                      <div className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                        with {team.name}
                      </div>
                      <button
                        type="button"
                        onClick={() => setStep("date")}
                        className="text-sm text-blue-600 hover:underline mt-2"
                      >
                        Change time
                      </button>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Your Name *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                        placeholder="John Doe"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Email *
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                        placeholder="john@example.com"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Phone (optional)
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                        placeholder="+1 (555) 000-0000"
                      />
                    </div>

                    {/* Custom Questions */}
                    {eventType.questions.map((question) => (
                      <div key={question.id}>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          {question.label} {question.required && "*"}
                        </label>
                        {question.type === "textarea" ? (
                          <textarea
                            value={formData.answers[question.id] || ""}
                            onChange={(e) => setFormData({
                              ...formData,
                              answers: { ...formData.answers, [question.id]: e.target.value },
                            })}
                            required={question.required}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                            placeholder={question.placeholder}
                          />
                        ) : question.type === "select" ? (
                          <select
                            value={formData.answers[question.id] || ""}
                            onChange={(e) => setFormData({
                              ...formData,
                              answers: { ...formData.answers, [question.id]: e.target.value },
                            })}
                            required={question.required}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                          >
                            <option value="">Select...</option>
                            {question.options?.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        ) : question.type === "checkbox" ? (
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={formData.answers[question.id] || false}
                              onChange={(e) => setFormData({
                                ...formData,
                                answers: { ...formData.answers, [question.id]: e.target.checked },
                              })}
                              required={question.required}
                              className="rounded border-gray-300 dark:border-gray-600"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">Yes</span>
                          </label>
                        ) : (
                          <input
                            type="text"
                            value={formData.answers[question.id] || ""}
                            onChange={(e) => setFormData({
                              ...formData,
                              answers: { ...formData.answers, [question.id]: e.target.value },
                            })}
                            required={question.required}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                            placeholder={question.placeholder}
                          />
                        )}
                      </div>
                    ))}

                    <button
                      type="submit"
                      disabled={booking}
                      className="w-full px-4 py-3 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                    >
                      {booking ? "Booking..." : "Confirm Team Booking"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
          Powered by Aexy
        </p>
      </div>
    </div>
  );
}

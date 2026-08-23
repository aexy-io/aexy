import type { Metadata } from "next";
import { BreadcrumbJsonLd, ProductJsonLd } from "@/components/marketing/StructuredData";

// Metadata lives in a layout because page.tsx is a client component and Next
// ignores a `metadata` export there. Without this the route inherited the root
// layout's title, description, and canonical — shipping as a duplicate of the
// homepage.
export const metadata: Metadata = {
  title: "Team Scheduling & Booking Links",
  description:
    "Round-robin and team scheduling with Google and Microsoft calendar sync, shareable booking links, and bookings that land on the right CRM record.",
  alternates: { canonical: "/products/booking" },
};

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProductJsonLd
        name="Team Scheduling & Booking Links"
        description="Round-robin and team scheduling with Google and Microsoft calendar sync, shareable booking links, and bookings that land on the right CRM record."
        path="/products/booking"
      />
      <BreadcrumbJsonLd
        trail={[
          { name: "Booking", path: "/products/booking" },
        ]}
      />
      {children}
    </>
  );
}

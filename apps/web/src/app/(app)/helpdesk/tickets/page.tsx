'use client';

import { TicketListPage } from '@/components/helpdesk/ticket-list-page';

export default function HelpdeskAllTicketsPage() {
  return (
    <TicketListPage
      title="All Tickets"
      description="Every IT helpdesk ticket you are allowed to see."
      scope="all"
      createEnabled
    />
  );
}

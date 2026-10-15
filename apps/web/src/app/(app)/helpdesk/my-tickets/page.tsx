'use client';

import { TicketListPage } from '@/components/helpdesk/ticket-list-page';

export default function HelpdeskMyTicketsPage() {
  return (
    <TicketListPage
      title="My Tickets"
      description="Tickets you submitted."
      scope="mine"
      createEnabled
    />
  );
}

'use client';

import { TicketListPage } from '@/components/helpdesk/ticket-list-page';

export default function HelpdeskAssignedTicketsPage() {
  return (
    <TicketListPage
      title="Assigned to Me"
      description="Tickets currently assigned to you."
      scope="assigned"
    />
  );
}

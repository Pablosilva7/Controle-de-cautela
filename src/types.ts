export interface Key {
  id: string;
  name: string;
  crq: string;
  status: 'available' | 'in_field';
  created_at: string;
}

export interface Movement {
  id: number;
  key_id: string;
  key_name: string;
  technician_name: string;
  company: string;
  crq: string;
  checkout_time: string;
  checkin_time: string | null;
  expected_return: string | null;
}

export interface Stats {
  total: number;
  inField: number;
  available: number;
  overdue: number;
}

export type Role = 'admin' | 'tech'
export type TaskStatus = 'assigned' | 'progress' | 'arrived' | 'review' | 'done' | 'returned'

export type Profile = {
  id: string
  full_name: string
  role: Role
  phone?: string | null
}

export type Assignee = {
  technician_id: string
  technician?: { full_name: string } | null
}

export type TaskFile = {
  id: string
  file_name: string
  storage_path: string
  mime_type?: string | null
  created_at: string
}

export type Activity = {
  id: string
  action: string
  details?: string | null
  created_at: string
  actor?: { full_name: string } | null
}

export type Checkin = {
  id: string
  event_type: 'arrive' | 'depart'
  latitude: number
  longitude: number
  created_at: string
  user?: { full_name: string } | null
}

export type Task = {
  id: string
  job_code: string
  title: string
  customer?: string | null
  phone?: string | null
  provider?: string | null
  work_type?: string | null
  address?: string | null
  scheduled_date: string
  scheduled_time?: string | null
  priority: string
  description?: string | null
  technician_notes?: string | null
  status: TaskStatus
  created_at: string
  task_assignees: Assignee[]
  task_files: TaskFile[]
  activity_log: Activity[]
  task_checkins: Checkin[]
}

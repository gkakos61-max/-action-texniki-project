import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from 'date-fns'
import { el } from 'date-fns/locale'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { supabase } from './supabase'
import type { Profile, Task, TaskStatus } from './types'

type Page = 'dashboard'|'tasks'|'calendar'|'new'|'reports'|'profile'
const statusText:Record<TaskStatus,string> = {
  assigned:'Ανατέθηκε', progress:'Σε εξέλιξη', arrived:'Άφιξη',
  review:'Για έγκριση', done:'Ολοκληρώθηκε', returned:'Επιστροφή'
}
const taskSelect = `*,
  task_assignees(technician_id,technician:profiles!task_assignees_technician_id_fkey(full_name)),
  task_files(*),
  activity_log(*,actor:profiles!activity_log_user_id_fkey(full_name)),
  task_checkins(*,user:profiles!task_checkins_user_id_fkey(full_name))`

export default function App(){
  const [profile,setProfile]=useState<Profile|null>(null)
  const [email,setEmail]=useState('')
  const [tasks,setTasks]=useState<Task[]>([])
  const [page,setPage]=useState<Page>('dashboard')
  const [selected,setSelected]=useState<Task|null>(null)
  const [loading,setLoading]=useState(true)

  useEffect(()=>{
    void boot()
    const {data}=supabase.auth.onAuthStateChange(async(event,session)=>{
      if(event==='PASSWORD_RECOVERY') return
      if(!session){setProfile(null);setTasks([])}
    })
    return ()=>data.subscription.unsubscribe()
  },[])

  async function boot(){
    setLoading(true)
    const {data:{session}}=await supabase.auth.getSession()
    if(!session){setLoading(false);return}
    setEmail(session.user.email||'')
    const {data,error}=await supabase.from('profiles').select('*').eq('id',session.user.id).single()
    if(error){alert('Δεν βρέθηκε προφίλ χρήστη.');await supabase.auth.signOut();setLoading(false);return}
    setProfile(data as Profile)
    await loadTasks()
    setLoading(false)
  }

  async function loadTasks(){
    const {data,error}=await supabase.from('tasks').select(taskSelect)
      .order('scheduled_date').order('scheduled_time')
    if(error){alert(error.message);return}
    setTasks((data||[]) as Task[])
  }

  async function refreshSelected(id:string){
    await loadTasks()
    const {data}=await supabase.from('tasks').select(taskSelect).eq('id',id).single()
    if(data)setSelected(data as Task)
  }

  if(loading)return <div className="center">Φόρτωση…</div>
  if(!profile)return <Login onLogin={boot}/>

  return <div className="app">
    <header className="topbar">
      <div><strong>Action Texniki</strong><small>Project</small></div>
      <span className="user-chip">{profile.full_name}</span>
    </header>

    <main className="page">
      {page==='dashboard'&&<Dashboard tasks={tasks} onOpen={setSelected}/>}
      {page==='tasks'&&<Tasks tasks={tasks} onOpen={setSelected} onRefresh={loadTasks}/>}
      {page==='calendar'&&<Calendar tasks={tasks} onOpen={setSelected}/>}
      {page==='new'&&profile.role==='admin'&&<NewTask onDone={async()=>{await loadTasks();setPage('tasks')}}/>}
      {page==='reports'&&<Reports tasks={tasks} onOpen={setSelected}/>}
      {page==='profile'&&<ProfilePage profile={profile} email={email}/>}
    </main>

    <nav className="nav">
      <Nav active={page==='dashboard'} icon="🏠" label="Αρχική" onClick={()=>setPage('dashboard')}/>
      <Nav active={page==='tasks'} icon="📋" label="Εργασίες" onClick={()=>setPage('tasks')}/>
      <Nav active={page==='calendar'} icon="📅" label="Ημερολόγιο" onClick={()=>setPage('calendar')}/>
      {profile.role==='admin'&&<Nav active={page==='new'} icon="➕" label="Νέα" onClick={()=>setPage('new')}/>}
      <Nav active={page==='reports'} icon="📄" label="Αναφορές" onClick={()=>setPage('reports')}/>
      <Nav active={page==='profile'} icon="👤" label="Προφίλ" onClick={()=>setPage('profile')}/>
    </nav>

    {selected&&<TaskModal task={selected} profile={profile} onClose={()=>setSelected(null)}
      onChanged={()=>refreshSelected(selected.id)}/>}
  </div>
}

function Login({onLogin}:{onLogin:()=>Promise<void>}){
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[msg,setMsg]=useState('')
  async function submit(e:FormEvent){
    e.preventDefault();setMsg('Σύνδεση…')
    const {error}=await supabase.auth.signInWithPassword({email,password})
    if(error){setMsg('Λάθος email ή κωδικός.');return}
    await onLogin()
  }
  async function forgot(){
    if(!email){setMsg('Γράψε πρώτα το email σου.');return}
    const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin})
    setMsg(error?error.message:'Στάλθηκε email επαναφοράς.')
  }
  return <div className="login-screen"><form className="login-card" onSubmit={submit}>
    <h1>Action Texniki Project</h1><p className="muted">Cloud διαχείριση τεχνικών εργασιών</p>
    <Field label="Email"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></Field>
    <Field label="Κωδικός"><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></Field>
    <button className="btn primary full">Σύνδεση</button>
    <button type="button" className="link" onClick={forgot}>Ξέχασα τον κωδικό</button>
    <p className="error">{msg}</p>
  </form></div>
}

function Dashboard({tasks,onOpen}:{tasks:Task[];onOpen:(t:Task)=>void}){
  const today=new Date().toISOString().slice(0,10)
  const counts={
    today:tasks.filter(t=>t.scheduled_date===today).length,
    progress:tasks.filter(t=>['progress','arrived'].includes(t.status)).length,
    review:tasks.filter(t=>t.status==='review').length,
    done:tasks.filter(t=>t.status==='done').length
  }
  return <>
    <h1>Dashboard</h1>
    <div className="stats">
      <Stat label="Σήμερα" n={counts.today}/><Stat label="Σε εξέλιξη" n={counts.progress}/>
      <Stat label="Για έγκριση" n={counts.review}/><Stat label="Ολοκληρωμένες" n={counts.done}/>
    </div>
    <h2>Επόμενες εργασίες</h2>
    <div className="task-grid">{tasks.slice(0,6).map(t=><TaskCard key={t.id} task={t} onClick={()=>onOpen(t)}/>)}</div>
  </>
}

function Tasks({tasks,onOpen,onRefresh}:{tasks:Task[];onOpen:(t:Task)=>void;onRefresh:()=>Promise<void>}){
  const [q,setQ]=useState(''),[status,setStatus]=useState('')
  const filtered=tasks.filter(t=>{
    const text=[t.job_code,t.title,t.customer,t.address,t.provider,t.work_type,
      t.task_assignees.map(a=>a.technician?.full_name).join(' ')].join(' ').toLowerCase()
    return text.includes(q.toLowerCase())&&(!status||t.status===status)
  })
  return <>
    <div className="head"><h1>Εργασίες</h1><button className="btn soft" onClick={()=>void onRefresh()}>Ανανέωση</button></div>
    <div className="filters">
      <input placeholder="Αναζήτηση…" value={q} onChange={e=>setQ(e.target.value)}/>
      <select value={status} onChange={e=>setStatus(e.target.value)}>
        <option value="">Όλες</option>{Object.entries(statusText).map(([k,v])=><option key={k} value={k}>{v}</option>)}
      </select>
    </div>
    <div className="task-grid">{filtered.map(t=><TaskCard key={t.id} task={t} onClick={()=>onOpen(t)}/>)}</div>
  </>
}

function Calendar({tasks,onOpen}:{tasks:Task[];onOpen:(t:Task)=>void}){
  const [month,setMonth]=useState(new Date())
  const days=eachDayOfInterval({start:startOfMonth(month),end:endOfMonth(month)})
  return <>
    <div className="head"><button className="btn soft" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}>‹</button>
      <h1>{format(month,'LLLL yyyy',{locale:el})}</h1>
      <button className="btn soft" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>›</button></div>
    <div className="calendar">
      {days.map(day=>{
        const dayTasks=tasks.filter(t=>isSameDay(parseISO(t.scheduled_date),day))
        return <div className="day" key={day.toISOString()}>
          <strong>{format(day,'d')}</strong>
          {dayTasks.map(t=><button key={t.id} className={`cal-task ${t.status}`} onClick={()=>onOpen(t)}>{t.scheduled_time?.slice(0,5)} {t.title}</button>)}
        </div>
      })}
    </div>
  </>
}

function NewTask({onDone}:{onDone:()=>Promise<void>}){
  const [techs,setTechs]=useState<Profile[]>([]),[selected,setSelected]=useState<string[]>([])
  const [f,setF]=useState({title:'',customer:'',phone:'',provider:'',workType:'',address:'',
    date:new Date(Date.now()+86400000).toISOString().slice(0,10),time:'09:00',priority:'Κανονική',description:''})
  useEffect(()=>{void(async()=>{
    const {data}=await supabase.from('profiles').select('*').eq('role','tech').order('full_name')
    setTechs((data||[]) as Profile[])
  })()},[])
  async function submit(e:FormEvent){
    e.preventDefault()
    if(!selected.length)return alert('Διάλεξε τουλάχιστον έναν τεχνικό.')
    const {data:code,error:ce}=await supabase.rpc('next_job_code');if(ce)return alert(ce.message)
    const {data:{user}}=await supabase.auth.getUser();if(!user)return
    const {data:task,error}=await supabase.from('tasks').insert({
      job_code:code,title:f.title,customer:f.customer||null,phone:f.phone||null,
      provider:f.provider||null,work_type:f.workType||null,address:f.address||null,
      scheduled_date:f.date,scheduled_time:f.time||null,priority:f.priority,
      description:f.description||null,status:'assigned',created_by:user.id
    }).select('id').single()
    if(error)return alert(error.message)
    const {error:ae}=await supabase.from('task_assignees').insert(selected.map(technician_id=>({task_id:task.id,technician_id})))
    if(ae)return alert(ae.message)
    await supabase.from('activity_log').insert({task_id:task.id,user_id:user.id,action:'created',details:'Δημιουργήθηκε και ανατέθηκε η εργασία'})
    alert('Η εργασία δημιουργήθηκε.');await onDone()
  }
  return <><h1>Νέα εργασία</h1><form className="panel" onSubmit={submit}>
    <div className="form-grid">
      <Field label="Τίτλος"><input required value={f.title} onChange={e=>setF({...f,title:e.target.value})}/></Field>
      <Field label="Πελάτης"><input value={f.customer} onChange={e=>setF({...f,customer:e.target.value})}/></Field>
      <Field label="Τηλέφωνο"><input value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/></Field>
      <Field label="Πάροχος"><select value={f.provider} onChange={e=>setF({...f,provider:e.target.value})}>
        <option value="">Επιλογή</option><option>Cosmote</option><option>Nova</option><option>Vodafone</option><option>Άλλο</option>
      </select></Field>
      <Field label="Τύπος εργασίας"><select value={f.workType} onChange={e=>setF({...f,workType:e.target.value})}>
        <option value="">Επιλογή</option><option>Νέα σύνδεση</option><option>Βλάβη</option><option>Μεταφορά</option><option>Συντήρηση</option>
      </select></Field>
      <Field label="Διεύθυνση"><input value={f.address} onChange={e=>setF({...f,address:e.target.value})}/></Field>
      <Field label="Ημερομηνία"><input type="date" required value={f.date} onChange={e=>setF({...f,date:e.target.value})}/></Field>
      <Field label="Ώρα"><input type="time" value={f.time} onChange={e=>setF({...f,time:e.target.value})}/></Field>
      <Field label="Προτεραιότητα"><select value={f.priority} onChange={e=>setF({...f,priority:e.target.value})}><option>Κανονική</option><option>Υψηλή</option><option>Επείγουσα</option></select></Field>
    </div>
    <Field label="Τεχνικοί"><div className="checks">{techs.map(t=><label key={t.id}>
      <input type="checkbox" checked={selected.includes(t.id)} onChange={e=>setSelected(e.target.checked?[...selected,t.id]:selected.filter(x=>x!==t.id))}/>{t.full_name}
    </label>)}</div></Field>
    <Field label="Περιγραφή"><textarea value={f.description} onChange={e=>setF({...f,description:e.target.value})}/></Field>
    <button className="btn primary full">Δημιουργία & ανάθεση</button>
  </form></>
}

function Reports({tasks,onOpen}:{tasks:Task[];onOpen:(t:Task)=>void}){
  const done=tasks.filter(t=>t.status==='done'||t.status==='review')
  return <><h1>Αναφορές</h1><p className="muted">Άνοιξε εργασία και πάτησε «PDF».</p>
    <div className="task-grid">{done.map(t=><TaskCard key={t.id} task={t} onClick={()=>onOpen(t)}/>)}</div></>
}

function TaskModal({task,profile,onClose,onChanged}:{task:Task;profile:Profile;onClose:()=>void;onChanged:()=>Promise<void>}){
  const [notes,setNotes]=useState(task.technician_notes||''),[files,setFiles]=useState<FileList|null>(null),[busy,setBusy]=useState(false)
  const reportRef=useRef<HTMLDivElement>(null)
  const names=task.task_assignees.map(a=>a.technician?.full_name).filter(Boolean).join(', ')

  async function log(action:string,details:string){
    const {data:{user}}=await supabase.auth.getUser();if(!user)return
    await supabase.from('activity_log').insert({task_id:task.id,user_id:user.id,action,details})
  }
  async function upload(){
    if(!files?.length)return
    const {data:{user}}=await supabase.auth.getUser();if(!user)return
    for(const file of Array.from(files)){
      const safe=file.name.replace(/[^\p{L}\p{N}._-]/gu,'_')
      const path=`${task.id}/${crypto.randomUUID()}-${safe}`
      const {error:ue}=await supabase.storage.from('task-files').upload(path,file)
      if(ue)throw ue
      const {error:de}=await supabase.from('task_files').insert({
        task_id:task.id,file_name:file.name,storage_path:path,mime_type:file.type,uploaded_by:user.id
      })
      if(de)throw de
    }
    await log('files_uploaded',`Ανέβηκαν ${files.length} αρχεία`)
  }
  async function save(){
    setBusy(true)
    const {error}=await supabase.from('tasks').update({technician_notes:notes}).eq('id',task.id)
    if(error){alert(error.message);setBusy(false);return}
    try{await upload();await log('updated','Ενημερώθηκαν τα στοιχεία της εργασίας')}
    catch(e){alert((e as Error).message);setBusy(false);return}
    await onChanged();setBusy(false);alert('Αποθηκεύτηκε.')
  }
  async function status(next:TaskStatus,label:string){
    setBusy(true)
    const {error}=await supabase.from('tasks').update({status:next,technician_notes:notes}).eq('id',task.id)
    if(error){alert(error.message);setBusy(false);return}
    await log(next,label);await onChanged();setBusy(false);onClose()
  }
  async function gps(type:'arrive'|'depart'){
    if(!navigator.geolocation)return alert('Η συσκευή δεν υποστηρίζει GPS.')
    navigator.geolocation.getCurrentPosition(async pos=>{
      const {data:{user}}=await supabase.auth.getUser();if(!user)return
      const {error}=await supabase.from('task_checkins').insert({
        task_id:task.id,user_id:user.id,event_type:type,
        latitude:pos.coords.latitude,longitude:pos.coords.longitude
      })
      if(error)return alert(error.message)
      await log(type,type==='arrive'?'Καταγράφηκε άφιξη':'Καταγράφηκε αναχώρηση')
      if(type==='arrive')await supabase.from('tasks').update({status:'arrived'}).eq('id',task.id)
      await onChanged();alert(type==='arrive'?'Η άφιξη καταγράφηκε.':'Η αναχώρηση καταγράφηκε.')
    },()=>alert('Δεν δόθηκε πρόσβαση στην τοποθεσία.'),{enableHighAccuracy:true})
  }
  async function openFile(path:string){
    const {data,error}=await supabase.storage.from('task-files').createSignedUrl(path,300)
    if(error)return alert(error.message);window.open(data.signedUrl,'_blank')
  }
  async function pdf(){
    if(!reportRef.current)return
    setBusy(true)
    const canvas=await html2canvas(reportRef.current,{scale:2,backgroundColor:'#ffffff'})
    const img=canvas.toDataURL('image/png')
    const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'})
    const width=190,height=canvas.height*width/canvas.width
    let y=10,remaining=height
    doc.addImage(img,'PNG',10,y,width,height)
    remaining-=277
    while(remaining>0){doc.addPage();y=-(height-remaining)+10;doc.addImage(img,'PNG',10,y,width,height);remaining-=277}
    doc.save(`${task.job_code}.pdf`);await log('pdf_created','Δημιουργήθηκε PDF αναφορά');setBusy(false)
  }
  return <div className="modal-bg" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="head"><div><h2>{task.title}</h2><span className="muted">{task.job_code}</span></div><button className="btn soft" onClick={onClose}>✕</button></div>
    <span className={`badge ${task.status}`}>{statusText[task.status]}</span>
    <div className="details">
      <div><b>Πελάτης:</b> {task.customer||'-'}</div><div><b>Πάροχος:</b> {task.provider||'-'}</div>
      <div><b>Τύπος:</b> {task.work_type||'-'}</div><div><b>Τεχνικοί:</b> {names||'-'}</div>
      <div><b>Ημερομηνία:</b> {task.scheduled_date} {task.scheduled_time?.slice(0,5)}</div>
      <div><b>Διεύθυνση:</b> {task.address||'-'}</div>
    </div>
    <div className="actions">
      {task.phone&&<a className="btn soft" href={`tel:${task.phone}`}>📞 Κλήση</a>}
      {task.address&&<button className="btn soft" onClick={()=>window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(task.address!)}`,'_blank')}>📍 Πλοήγηση</button>}
      <button className="btn soft" onClick={()=>void pdf()}>📄 PDF</button>
    </div>
    <Field label="Τεχνική αναφορά"><textarea value={notes} onChange={e=>setNotes(e.target.value)}/></Field>
    <Field label="Φωτογραφίες / αρχεία"><input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={e=>setFiles(e.target.files)}/></Field>
    <div className="file-list">{task.task_files.map(f=><button key={f.id} className="file" onClick={()=>void openFile(f.storage_path)}>📎 {f.file_name}</button>)}</div>
    <button disabled={busy} className="btn soft full" onClick={()=>void save()}>Αποθήκευση</button>
    <div className="actions">
      {profile.role==='tech'&&['assigned','returned'].includes(task.status)&&<button className="btn primary" onClick={()=>void status('progress','Ξεκίνησε η εργασία')}>Έναρξη</button>}
      {profile.role==='tech'&&['progress','arrived'].includes(task.status)&&<button className="btn success" onClick={()=>void gps('arrive')}>📍 Άφιξη</button>}
      {profile.role==='tech'&&['progress','arrived'].includes(task.status)&&<button className="btn success" onClick={()=>void status('review','Υποβλήθηκε για έγκριση')}>Ολοκλήρωση</button>}
      {profile.role==='tech'&&task.status==='review'&&<button className="btn soft" onClick={()=>void gps('depart')}>Αναχώρηση</button>}
      {profile.role==='admin'&&task.status==='review'&&<><button className="btn success" onClick={()=>void status('done','Εγκρίθηκε η εργασία')}>Έγκριση</button><button className="btn danger" onClick={()=>void status('returned','Επιστράφηκε για διόρθωση')}>Επιστροφή</button></>}
    </div>
    <h3>Ιστορικό</h3>
    <div className="timeline">{task.activity_log.sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(a=><div key={a.id}><b>{format(parseISO(a.created_at),'dd/MM HH:mm')}</b> {a.actor?.full_name||''} — {a.details||a.action}</div>)}</div>
    <div ref={reportRef} className="report">
      <h1>Action Texniki Project</h1><h2>Αναφορά Εργασίας {task.job_code}</h2>
      <p><b>Τίτλος:</b> {task.title}</p><p><b>Πελάτης:</b> {task.customer||'-'}</p>
      <p><b>Τηλέφωνο:</b> {task.phone||'-'}</p><p><b>Πάροχος:</b> {task.provider||'-'}</p>
      <p><b>Τύπος:</b> {task.work_type||'-'}</p><p><b>Διεύθυνση:</b> {task.address||'-'}</p>
      <p><b>Ημερομηνία:</b> {task.scheduled_date} {task.scheduled_time?.slice(0,5)}</p>
      <p><b>Τεχνικοί:</b> {names||'-'}</p><p><b>Κατάσταση:</b> {statusText[task.status]}</p>
      <h3>Τεχνική αναφορά</h3><p className="pre">{notes||task.technician_notes||'-'}</p>
      <h3>Ιστορικό</h3>{task.activity_log.map(a=><p key={a.id}>{format(parseISO(a.created_at),'dd/MM/yyyy HH:mm')} — {a.actor?.full_name||''} — {a.details||a.action}</p>)}
    </div>
  </div></div>
}

function ProfilePage({profile,email}:{profile:Profile;email:string}){
  const [p,setP]=useState(''),[c,setC]=useState('')
  async function change(e:FormEvent){
    e.preventDefault();if(p.length<8)return alert('Τουλάχιστον 8 χαρακτήρες.');if(p!==c)return alert('Οι κωδικοί δεν είναι ίδιοι.')
    const {error}=await supabase.auth.updateUser({password:p});if(error)return alert(error.message)
    setP('');setC('');alert('Ο κωδικός άλλαξε.')
  }
  return <><h1>Προφίλ</h1><div className="panel"><b>{profile.full_name}</b><p className="muted">{email} · {profile.role==='admin'?'Διαχειριστής':'Τεχνικός'}</p></div>
    <form className="panel" onSubmit={change}><h2>Αλλαγή κωδικού</h2><Field label="Νέος κωδικός"><input type="password" value={p} onChange={e=>setP(e.target.value)} required/></Field>
    <Field label="Επιβεβαίωση"><input type="password" value={c} onChange={e=>setC(e.target.value)} required/></Field><button className="btn primary full">Αλλαγή</button></form>
    <button className="btn danger" onClick={()=>void supabase.auth.signOut()}>Αποσύνδεση</button></>
}

function TaskCard({task,onClick}:{task:Task;onClick:()=>void}){
  const names=task.task_assignees.map(a=>a.technician?.full_name).filter(Boolean).join(', ')
  return <button className="task-card" onClick={onClick}><div className="head"><div><strong>{task.title}</strong><small>{task.job_code}</small></div><span className={`badge ${task.status}`}>{statusText[task.status]}</span></div>
    <div className="meta"><span>📅 {task.scheduled_date} {task.scheduled_time?.slice(0,5)}</span><span>📍 {task.address||'-'}</span><span>👥 {names||'-'}</span></div></button>
}
function Stat({label,n}:{label:string;n:number}){return <div className="stat"><small>{label}</small><b>{n}</b></div>}
function Nav({active,icon,label,onClick}:{active:boolean;icon:string;label:string;onClick:()=>void}){return <button className={active?'active':''} onClick={onClick}><span>{icon}</span>{label}</button>}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="field"><span>{label}</span>{children}</label>}

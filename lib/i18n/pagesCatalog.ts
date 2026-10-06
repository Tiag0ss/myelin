/** Domain UI copy for live pages and modals. Expand as screens are wired. */
export type PagesMessages = {
  dashboard: {
    title: string;
    calendar: string;
    kanban: string;
    myTasks: string;
    overview: string;
    noTasks: string;
    loadingDashboard: string;
  };
  projects: {
    title: string;
    newProject: string;
    editProject: string;
    deleteProject: string;
    projectName: string;
    noProjects: string;
    searchProjects: string;
    tasksTab: string;
    planningTab: string;
    reportingTab: string;
    expensesTab: string;
    settingsTab: string;
    membersTab: string;
    dependenciesTab: string;
    openProject: string;
    createProject: string;
  };
  planning: {
    title: string;
    allocations: string;
    availability: string;
    outlookCalendar: string;
    loadingOutlook: string;
    noAllocations: string;
    capacity: string;
    overload: string;
  };
  timesheet: {
    title: string;
    allEntries: string;
    resume: string;
    addEntry: string;
    editEntry: string;
    deleteEntry: string;
    noEntries: string;
    startTime: string;
    endTime: string;
    duration: string;
    billable: string;
    nonBillable: string;
  };
  tickets: {
    title: string;
    newTicket: string;
    editTicket: string;
    noTickets: string;
    searchTickets: string;
    assignee: string;
    reporter: string;
    linkedTask: string;
  };
  memos: {
    title: string;
    newMemo: string;
    noMemos: string;
    searchMemos: string;
  };
  expenses: {
    title: string;
    newExpense: string;
    noExpenses: string;
    amount: string;
    category: string;
    receipt: string;
    approve: string;
    reject: string;
  };
  customers: {
    title: string;
    newCustomer: string;
    editCustomer: string;
    noCustomers: string;
    searchCustomers: string;
  };
  applications: {
    title: string;
    newApplication: string;
    noApplications: string;
    releases: string;
  };
  organizations: {
    title: string;
    newOrganization: string;
    members: string;
    settings: string;
    integrations: string;
  };
  users: {
    title: string;
    newUser: string;
    editUser: string;
    noUsers: string;
    roles: string;
    invite: string;
  };
  reporting: {
    title: string;
    savedReports: string;
    runReport: string;
    noReports: string;
  };
  administration: {
    title: string;
    systemSettings: string;
    customFields: string;
    customTables: string;
    slaRules: string;
  };
  portal: {
    title: string;
    customerPortal: string;
    myTickets: string;
  };
  notifications: {
    title: string;
    markRead: string;
    markAllRead: string;
    empty: string;
  };
  approvals: {
    title: string;
    vacations: string;
    outOfOffice: string;
    pending: string;
    approved: string;
    rejected: string;
  };
  callRecords: {
    title: string;
    newCall: string;
    noCalls: string;
  };
  workSummary: {
    title: string;
    noSummary: string;
  };
  profile: {
    title: string;
    preferences: string;
    languageHint: string;
    saveProfile: string;
    changePassword: string;
    emailPreferences: string;
    apiTokens: string;
    taskFormVisibility: string;
    loading: string;
  };
  taskDetail: {
    title: string;
    saveTask: string;
    deleteTask: string;
    assignees: string;
    dueDate: string;
    estimatedHours: string;
    workedHours: string;
    description: string;
    comments: string;
    attachments: string;
    timeEntries: string;
    subtasks: string;
    parentTask: string;
    addComment: string;
    noComments: string;
  };
  timer: {
    start: string;
    stop: string;
    selectTask: string;
    running: string;
  };
  modals: {
    closeAria: string;
    confirmDeleteTask: string;
    confirmDeleteProject: string;
    confirmDeleteEntry: string;
  };
};

function pages(
  p: PagesMessages
): PagesMessages {
  return p;
}

export const pagesEn = pages({
  dashboard: {
    title: 'Dashboard',
    calendar: 'Calendar',
    kanban: 'Kanban',
    myTasks: 'My tasks',
    overview: 'Overview',
    noTasks: 'No tasks to show.',
    loadingDashboard: 'Loading dashboard…',
  },
  projects: {
    title: 'Projects',
    newProject: 'New project',
    editProject: 'Edit project',
    deleteProject: 'Delete project',
    projectName: 'Project name',
    noProjects: 'No projects found.',
    searchProjects: 'Search projects…',
    tasksTab: 'Tasks',
    planningTab: 'Planning',
    reportingTab: 'Reporting',
    expensesTab: 'Expenses',
    settingsTab: 'Settings',
    membersTab: 'Members',
    dependenciesTab: 'Dependencies',
    openProject: 'Open project',
    createProject: 'Create project',
  },
  planning: {
    title: 'Planning',
    allocations: 'Allocations',
    availability: 'Availability',
    outlookCalendar: 'Outlook calendar',
    loadingOutlook: 'Loading Outlook events…',
    noAllocations: 'No allocations in this range.',
    capacity: 'Capacity',
    overload: 'Overload',
  },
  timesheet: {
    title: 'Timesheet',
    allEntries: 'All entries',
    resume: 'Resume',
    addEntry: 'Add entry',
    editEntry: 'Edit entry',
    deleteEntry: 'Delete entry',
    noEntries: 'No time entries found.',
    startTime: 'Start time',
    endTime: 'End time',
    duration: 'Duration',
    billable: 'Billable',
    nonBillable: 'Non-billable',
  },
  tickets: {
    title: 'Tickets',
    newTicket: 'New ticket',
    editTicket: 'Edit ticket',
    noTickets: 'No tickets found.',
    searchTickets: 'Search tickets…',
    assignee: 'Assignee',
    reporter: 'Reporter',
    linkedTask: 'Linked task',
  },
  memos: {
    title: 'Memos',
    newMemo: 'New memo',
    noMemos: 'No memos found.',
    searchMemos: 'Search memos…',
  },
  expenses: {
    title: 'Expenses',
    newExpense: 'New expense',
    noExpenses: 'No expenses found.',
    amount: 'Amount',
    category: 'Category',
    receipt: 'Receipt',
    approve: 'Approve',
    reject: 'Reject',
  },
  customers: {
    title: 'Customers',
    newCustomer: 'New customer',
    editCustomer: 'Edit customer',
    noCustomers: 'No customers found.',
    searchCustomers: 'Search customers…',
  },
  applications: {
    title: 'Applications',
    newApplication: 'New application',
    noApplications: 'No applications found.',
    releases: 'Releases',
  },
  organizations: {
    title: 'Organizations',
    newOrganization: 'New organization',
    members: 'Members',
    settings: 'Settings',
    integrations: 'Integrations',
  },
  users: {
    title: 'Users',
    newUser: 'New user',
    editUser: 'Edit user',
    noUsers: 'No users found.',
    roles: 'Roles',
    invite: 'Invite',
  },
  reporting: {
    title: 'Reporting',
    savedReports: 'Saved reports',
    runReport: 'Run report',
    noReports: 'No reports found.',
  },
  administration: {
    title: 'Administration',
    systemSettings: 'System settings',
    customFields: 'Custom fields',
    customTables: 'Custom tables',
    slaRules: 'SLA rules',
  },
  portal: {
    title: 'Portal',
    customerPortal: 'Customer portal',
    myTickets: 'My tickets',
  },
  notifications: {
    title: 'Notifications',
    markRead: 'Mark as read',
    markAllRead: 'Mark all as read',
    empty: 'No notifications.',
  },
  approvals: {
    title: 'Approvals',
    vacations: 'Vacations',
    outOfOffice: 'Out of office',
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
  },
  callRecords: {
    title: 'Call records',
    newCall: 'New call record',
    noCalls: 'No call records found.',
  },
  workSummary: {
    title: 'Work summary',
    noSummary: 'No work summary for this period.',
  },
  profile: {
    title: 'My profile',
    preferences: 'Preferences',
    languageHint: 'UI language for Myelin. Content you write stays in its original language.',
    saveProfile: 'Save profile',
    changePassword: 'Change password',
    emailPreferences: 'Email preferences',
    apiTokens: 'API tokens',
    taskFormVisibility: 'Task form fields',
    loading: 'Loading profile…',
  },
  taskDetail: {
    title: 'Task details',
    saveTask: 'Save task',
    deleteTask: 'Delete task',
    assignees: 'Assignees',
    dueDate: 'Due date',
    estimatedHours: 'Estimated hours',
    workedHours: 'Worked hours',
    description: 'Description',
    comments: 'Comments',
    attachments: 'Attachments',
    timeEntries: 'Time entries',
    subtasks: 'Subtasks',
    parentTask: 'Parent task',
    addComment: 'Add comment',
    noComments: 'No comments yet.',
  },
  timer: {
    start: 'Start timer',
    stop: 'Stop timer',
    selectTask: 'Select a task',
    running: 'Timer running',
  },
  modals: {
    closeAria: 'Close dialog',
    confirmDeleteTask: 'Are you sure you want to delete this task?',
    confirmDeleteProject: 'Are you sure you want to delete this project?',
    confirmDeleteEntry: 'Are you sure you want to delete this entry?',
  },
});

export const pagesPt = pages({
  dashboard: {
    title: 'Painel',
    calendar: 'Calendário',
    kanban: 'Kanban',
    myTasks: 'As minhas tarefas',
    overview: 'Visão geral',
    noTasks: 'Sem tarefas para mostrar.',
    loadingDashboard: 'A carregar o painel…',
  },
  projects: {
    title: 'Projectos',
    newProject: 'Novo projecto',
    editProject: 'Editar projecto',
    deleteProject: 'Eliminar projecto',
    projectName: 'Nome do projecto',
    noProjects: 'Nenhum projecto encontrado.',
    searchProjects: 'Pesquisar projectos…',
    tasksTab: 'Tarefas',
    planningTab: 'Planeamento',
    reportingTab: 'Relatórios',
    expensesTab: 'Despesas',
    settingsTab: 'Definições',
    membersTab: 'Membros',
    dependenciesTab: 'Dependências',
    openProject: 'Abrir projecto',
    createProject: 'Criar projecto',
  },
  planning: {
    title: 'Planeamento',
    allocations: 'Alocações',
    availability: 'Disponibilidade',
    outlookCalendar: 'Calendário Outlook',
    loadingOutlook: 'A carregar eventos do Outlook…',
    noAllocations: 'Sem alocações neste intervalo.',
    capacity: 'Capacidade',
    overload: 'Sobrecarga',
  },
  timesheet: {
    title: 'Folha de horas',
    allEntries: 'Todas as entradas',
    resume: 'Resumo',
    addEntry: 'Adicionar entrada',
    editEntry: 'Editar entrada',
    deleteEntry: 'Eliminar entrada',
    noEntries: 'Nenhuma entrada de tempo encontrada.',
    startTime: 'Hora de início',
    endTime: 'Hora de fim',
    duration: 'Duração',
    billable: 'Faturável',
    nonBillable: 'Não faturável',
  },
  tickets: {
    title: 'Tickets',
    newTicket: 'Novo ticket',
    editTicket: 'Editar ticket',
    noTickets: 'Nenhum ticket encontrado.',
    searchTickets: 'Pesquisar tickets…',
    assignee: 'Responsável',
    reporter: 'Reportado por',
    linkedTask: 'Tarefa associada',
  },
  memos: {
    title: 'Notas',
    newMemo: 'Nova nota',
    noMemos: 'Nenhuma nota encontrada.',
    searchMemos: 'Pesquisar notas…',
  },
  expenses: {
    title: 'Despesas',
    newExpense: 'Nova despesa',
    noExpenses: 'Nenhuma despesa encontrada.',
    amount: 'Montante',
    category: 'Categoria',
    receipt: 'Recibo',
    approve: 'Aprovar',
    reject: 'Rejeitar',
  },
  customers: {
    title: 'Clientes',
    newCustomer: 'Novo cliente',
    editCustomer: 'Editar cliente',
    noCustomers: 'Nenhum cliente encontrado.',
    searchCustomers: 'Pesquisar clientes…',
  },
  applications: {
    title: 'Aplicações',
    newApplication: 'Nova aplicação',
    noApplications: 'Nenhuma aplicação encontrada.',
    releases: 'Releases',
  },
  organizations: {
    title: 'Organizações',
    newOrganization: 'Nova organização',
    members: 'Membros',
    settings: 'Definições',
    integrations: 'Integrações',
  },
  users: {
    title: 'Utilizadores',
    newUser: 'Novo utilizador',
    editUser: 'Editar utilizador',
    noUsers: 'Nenhum utilizador encontrado.',
    roles: 'Funções',
    invite: 'Convidar',
  },
  reporting: {
    title: 'Relatórios',
    savedReports: 'Relatórios guardados',
    runReport: 'Executar relatório',
    noReports: 'Nenhum relatório encontrado.',
  },
  administration: {
    title: 'Administração',
    systemSettings: 'Definições do sistema',
    customFields: 'Campos personalizados',
    customTables: 'Tabelas personalizadas',
    slaRules: 'Regras de SLA',
  },
  portal: {
    title: 'Portal',
    customerPortal: 'Portal do cliente',
    myTickets: 'Os meus tickets',
  },
  notifications: {
    title: 'Notificações',
    markRead: 'Marcar como lida',
    markAllRead: 'Marcar todas como lidas',
    empty: 'Sem notificações.',
  },
  approvals: {
    title: 'Aprovações',
    vacations: 'Férias',
    outOfOffice: 'Ausência',
    pending: 'Pendente',
    approved: 'Aprovado',
    rejected: 'Rejeitado',
  },
  callRecords: {
    title: 'Registos de chamadas',
    newCall: 'Novo registo de chamada',
    noCalls: 'Nenhum registo de chamada encontrado.',
  },
  workSummary: {
    title: 'Resumo de trabalho',
    noSummary: 'Sem resumo de trabalho para este período.',
  },
  profile: {
    title: 'O meu perfil',
    preferences: 'Preferências',
    languageHint: 'Idioma da interface do Myelin. O conteúdo que escreve mantém-se no idioma original.',
    saveProfile: 'Guardar perfil',
    changePassword: 'Alterar palavra-passe',
    emailPreferences: 'Preferências de e-mail',
    apiTokens: 'Tokens de API',
    taskFormVisibility: 'Campos do formulário de tarefa',
    loading: 'A carregar o perfil…',
  },
  taskDetail: {
    title: 'Detalhes da tarefa',
    saveTask: 'Guardar tarefa',
    deleteTask: 'Eliminar tarefa',
    assignees: 'Responsáveis',
    dueDate: 'Data de vencimento',
    estimatedHours: 'Horas estimadas',
    workedHours: 'Horas trabalhadas',
    description: 'Descrição',
    comments: 'Comentários',
    attachments: 'Anexos',
    timeEntries: 'Entradas de tempo',
    subtasks: 'Subtarefas',
    parentTask: 'Tarefa pai',
    addComment: 'Adicionar comentário',
    noComments: 'Ainda sem comentários.',
  },
  timer: {
    start: 'Iniciar temporizador',
    stop: 'Parar temporizador',
    selectTask: 'Seleccionar uma tarefa',
    running: 'Temporizador em execução',
  },
  modals: {
    closeAria: 'Fechar diálogo',
    confirmDeleteTask: 'Tem a certeza de que pretende eliminar esta tarefa?',
    confirmDeleteProject: 'Tem a certeza de que pretende eliminar este projecto?',
    confirmDeleteEntry: 'Tem a certeza de que pretende eliminar esta entrada?',
  },
});

export const pagesEs = pages({
  dashboard: {
    title: 'Panel',
    calendar: 'Calendario',
    kanban: 'Kanban',
    myTasks: 'Mis tareas',
    overview: 'Resumen',
    noTasks: 'No hay tareas que mostrar.',
    loadingDashboard: 'Cargando el panel…',
  },
  projects: {
    title: 'Proyectos',
    newProject: 'Nuevo proyecto',
    editProject: 'Editar proyecto',
    deleteProject: 'Eliminar proyecto',
    projectName: 'Nombre del proyecto',
    noProjects: 'No se encontraron proyectos.',
    searchProjects: 'Buscar proyectos…',
    tasksTab: 'Tareas',
    planningTab: 'Planificación',
    reportingTab: 'Informes',
    expensesTab: 'Gastos',
    settingsTab: 'Ajustes',
    membersTab: 'Miembros',
    dependenciesTab: 'Dependencias',
    openProject: 'Abrir proyecto',
    createProject: 'Crear proyecto',
  },
  planning: {
    title: 'Planificación',
    allocations: 'Asignaciones',
    availability: 'Disponibilidad',
    outlookCalendar: 'Calendario de Outlook',
    loadingOutlook: 'Cargando eventos de Outlook…',
    noAllocations: 'No hay asignaciones en este intervalo.',
    capacity: 'Capacidad',
    overload: 'Sobrecarga',
  },
  timesheet: {
    title: 'Parte de horas',
    allEntries: 'Todas las entradas',
    resume: 'Resumen',
    addEntry: 'Añadir entrada',
    editEntry: 'Editar entrada',
    deleteEntry: 'Eliminar entrada',
    noEntries: 'No se encontraron entradas de tiempo.',
    startTime: 'Hora de inicio',
    endTime: 'Hora de fin',
    duration: 'Duración',
    billable: 'Facturable',
    nonBillable: 'No facturable',
  },
  tickets: {
    title: 'Tickets',
    newTicket: 'Nuevo ticket',
    editTicket: 'Editar ticket',
    noTickets: 'No se encontraron tickets.',
    searchTickets: 'Buscar tickets…',
    assignee: 'Asignado',
    reporter: 'Reportado por',
    linkedTask: 'Tarea vinculada',
  },
  memos: {
    title: 'Notas',
    newMemo: 'Nueva nota',
    noMemos: 'No se encontraron notas.',
    searchMemos: 'Buscar notas…',
  },
  expenses: {
    title: 'Gastos',
    newExpense: 'Nuevo gasto',
    noExpenses: 'No se encontraron gastos.',
    amount: 'Importe',
    category: 'Categoría',
    receipt: 'Recibo',
    approve: 'Aprobar',
    reject: 'Rechazar',
  },
  customers: {
    title: 'Clientes',
    newCustomer: 'Nuevo cliente',
    editCustomer: 'Editar cliente',
    noCustomers: 'No se encontraron clientes.',
    searchCustomers: 'Buscar clientes…',
  },
  applications: {
    title: 'Aplicaciones',
    newApplication: 'Nueva aplicación',
    noApplications: 'No se encontraron aplicaciones.',
    releases: 'Releases',
  },
  organizations: {
    title: 'Organizaciones',
    newOrganization: 'Nueva organización',
    members: 'Miembros',
    settings: 'Ajustes',
    integrations: 'Integraciones',
  },
  users: {
    title: 'Usuarios',
    newUser: 'Nuevo usuario',
    editUser: 'Editar usuario',
    noUsers: 'No se encontraron usuarios.',
    roles: 'Roles',
    invite: 'Invitar',
  },
  reporting: {
    title: 'Informes',
    savedReports: 'Informes guardados',
    runReport: 'Ejecutar informe',
    noReports: 'No se encontraron informes.',
  },
  administration: {
    title: 'Administración',
    systemSettings: 'Ajustes del sistema',
    customFields: 'Campos personalizados',
    customTables: 'Tablas personalizadas',
    slaRules: 'Reglas de SLA',
  },
  portal: {
    title: 'Portal',
    customerPortal: 'Portal del cliente',
    myTickets: 'Mis tickets',
  },
  notifications: {
    title: 'Notificaciones',
    markRead: 'Marcar como leída',
    markAllRead: 'Marcar todas como leídas',
    empty: 'Sin notificaciones.',
  },
  approvals: {
    title: 'Aprobaciones',
    vacations: 'Vacaciones',
    outOfOffice: 'Fuera de la oficina',
    pending: 'Pendiente',
    approved: 'Aprobado',
    rejected: 'Rechazado',
  },
  callRecords: {
    title: 'Registros de llamadas',
    newCall: 'Nuevo registro de llamada',
    noCalls: 'No se encontraron registros de llamadas.',
  },
  workSummary: {
    title: 'Resumen de trabajo',
    noSummary: 'No hay resumen de trabajo para este periodo.',
  },
  profile: {
    title: 'Mi perfil',
    preferences: 'Preferencias',
    languageHint: 'Idioma de la interfaz de Myelin. El contenido que escribe permanece en su idioma original.',
    saveProfile: 'Guardar perfil',
    changePassword: 'Cambiar contraseña',
    emailPreferences: 'Preferencias de correo',
    apiTokens: 'Tokens de API',
    taskFormVisibility: 'Campos del formulario de tarea',
    loading: 'Cargando perfil…',
  },
  taskDetail: {
    title: 'Detalles de la tarea',
    saveTask: 'Guardar tarea',
    deleteTask: 'Eliminar tarea',
    assignees: 'Asignados',
    dueDate: 'Fecha de vencimiento',
    estimatedHours: 'Horas estimadas',
    workedHours: 'Horas trabajadas',
    description: 'Descripción',
    comments: 'Comentarios',
    attachments: 'Adjuntos',
    timeEntries: 'Entradas de tiempo',
    subtasks: 'Subtareas',
    parentTask: 'Tarea padre',
    addComment: 'Añadir comentario',
    noComments: 'Aún no hay comentarios.',
  },
  timer: {
    start: 'Iniciar temporizador',
    stop: 'Detener temporizador',
    selectTask: 'Seleccionar una tarea',
    running: 'Temporizador en marcha',
  },
  modals: {
    closeAria: 'Cerrar diálogo',
    confirmDeleteTask: '¿Seguro que desea eliminar esta tarea?',
    confirmDeleteProject: '¿Seguro que desea eliminar este proyecto?',
    confirmDeleteEntry: '¿Seguro que desea eliminar esta entrada?',
  },
});

export const pagesFr = pages({
  dashboard: {
    title: 'Tableau de bord',
    calendar: 'Calendrier',
    kanban: 'Kanban',
    myTasks: 'Mes tâches',
    overview: 'Aperçu',
    noTasks: 'Aucune tâche à afficher.',
    loadingDashboard: 'Chargement du tableau de bord…',
  },
  projects: {
    title: 'Projets',
    newProject: 'Nouveau projet',
    editProject: 'Modifier le projet',
    deleteProject: 'Supprimer le projet',
    projectName: 'Nom du projet',
    noProjects: 'Aucun projet trouvé.',
    searchProjects: 'Rechercher des projets…',
    tasksTab: 'Tâches',
    planningTab: 'Planification',
    reportingTab: 'Rapports',
    expensesTab: 'Dépenses',
    settingsTab: 'Paramètres',
    membersTab: 'Membres',
    dependenciesTab: 'Dépendances',
    openProject: 'Ouvrir le projet',
    createProject: 'Créer un projet',
  },
  planning: {
    title: 'Planification',
    allocations: 'Allocations',
    availability: 'Disponibilité',
    outlookCalendar: 'Calendrier Outlook',
    loadingOutlook: 'Chargement des événements Outlook…',
    noAllocations: 'Aucune allocation dans cette période.',
    capacity: 'Capacité',
    overload: 'Surcharge',
  },
  timesheet: {
    title: 'Feuille de temps',
    allEntries: 'Toutes les entrées',
    resume: 'Résumé',
    addEntry: 'Ajouter une entrée',
    editEntry: 'Modifier l’entrée',
    deleteEntry: 'Supprimer l’entrée',
    noEntries: 'Aucune entrée de temps trouvée.',
    startTime: 'Heure de début',
    endTime: 'Heure de fin',
    duration: 'Durée',
    billable: 'Facturable',
    nonBillable: 'Non facturable',
  },
  tickets: {
    title: 'Tickets',
    newTicket: 'Nouveau ticket',
    editTicket: 'Modifier le ticket',
    noTickets: 'Aucun ticket trouvé.',
    searchTickets: 'Rechercher des tickets…',
    assignee: 'Assigné',
    reporter: 'Déclarant',
    linkedTask: 'Tâche liée',
  },
  memos: {
    title: 'Mémos',
    newMemo: 'Nouveau mémo',
    noMemos: 'Aucun mémo trouvé.',
    searchMemos: 'Rechercher des mémos…',
  },
  expenses: {
    title: 'Dépenses',
    newExpense: 'Nouvelle dépense',
    noExpenses: 'Aucune dépense trouvée.',
    amount: 'Montant',
    category: 'Catégorie',
    receipt: 'Reçu',
    approve: 'Approuver',
    reject: 'Rejeter',
  },
  customers: {
    title: 'Clients',
    newCustomer: 'Nouveau client',
    editCustomer: 'Modifier le client',
    noCustomers: 'Aucun client trouvé.',
    searchCustomers: 'Rechercher des clients…',
  },
  applications: {
    title: 'Applications',
    newApplication: 'Nouvelle application',
    noApplications: 'Aucune application trouvée.',
    releases: 'Versions',
  },
  organizations: {
    title: 'Organisations',
    newOrganization: 'Nouvelle organisation',
    members: 'Membres',
    settings: 'Paramètres',
    integrations: 'Intégrations',
  },
  users: {
    title: 'Utilisateurs',
    newUser: 'Nouvel utilisateur',
    editUser: 'Modifier l’utilisateur',
    noUsers: 'Aucun utilisateur trouvé.',
    roles: 'Rôles',
    invite: 'Inviter',
  },
  reporting: {
    title: 'Rapports',
    savedReports: 'Rapports enregistrés',
    runReport: 'Exécuter le rapport',
    noReports: 'Aucun rapport trouvé.',
  },
  administration: {
    title: 'Administration',
    systemSettings: 'Paramètres système',
    customFields: 'Champs personnalisés',
    customTables: 'Tables personnalisées',
    slaRules: 'Règles SLA',
  },
  portal: {
    title: 'Portail',
    customerPortal: 'Portail client',
    myTickets: 'Mes tickets',
  },
  notifications: {
    title: 'Notifications',
    markRead: 'Marquer comme lu',
    markAllRead: 'Tout marquer comme lu',
    empty: 'Aucune notification.',
  },
  approvals: {
    title: 'Validations',
    vacations: 'Congés',
    outOfOffice: 'Absent du bureau',
    pending: 'En attente',
    approved: 'Approuvé',
    rejected: 'Rejeté',
  },
  callRecords: {
    title: 'Appels',
    newCall: 'Nouvel enregistrement d’appel',
    noCalls: 'Aucun enregistrement d’appel trouvé.',
  },
  workSummary: {
    title: 'Résumé du travail',
    noSummary: 'Aucun résumé pour cette période.',
  },
  profile: {
    title: 'Mon profil',
    preferences: 'Préférences',
    languageHint: 'Langue de l’interface Myelin. Le contenu que vous écrivez reste dans sa langue d’origine.',
    saveProfile: 'Enregistrer le profil',
    changePassword: 'Changer le mot de passe',
    emailPreferences: 'Préférences e-mail',
    apiTokens: 'Jetons API',
    taskFormVisibility: 'Champs du formulaire de tâche',
    loading: 'Chargement du profil…',
  },
  taskDetail: {
    title: 'Détails de la tâche',
    saveTask: 'Enregistrer la tâche',
    deleteTask: 'Supprimer la tâche',
    assignees: 'Assignés',
    dueDate: 'Date d’échéance',
    estimatedHours: 'Heures estimées',
    workedHours: 'Heures travaillées',
    description: 'Description',
    comments: 'Commentaires',
    attachments: 'Pièces jointes',
    timeEntries: 'Entrées de temps',
    subtasks: 'Sous-tâches',
    parentTask: 'Tâche parente',
    addComment: 'Ajouter un commentaire',
    noComments: 'Aucun commentaire pour l’instant.',
  },
  timer: {
    start: 'Démarrer le minuteur',
    stop: 'Arrêter le minuteur',
    selectTask: 'Sélectionner une tâche',
    running: 'Minuteur en cours',
  },
  modals: {
    closeAria: 'Fermer la boîte de dialogue',
    confirmDeleteTask: 'Voulez-vous vraiment supprimer cette tâche ?',
    confirmDeleteProject: 'Voulez-vous vraiment supprimer ce projet ?',
    confirmDeleteEntry: 'Voulez-vous vraiment supprimer cette entrée ?',
  },
});

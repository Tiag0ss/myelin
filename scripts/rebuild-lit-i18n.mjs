#!/usr/bin/env node
/**
 * Rebuild litPt / litEs / litFr from litEn keys using:
 * - cached MyMemory translations (lib/i18n/.lit-translate-cache.json)
 * - exact phrase maps
 * - longest-first token replacement + common UI phrase patterns
 */
import fs from 'fs';

const catalogPath = 'lib/i18n/literalsCatalog.ts';
const cachePath = 'lib/i18n/.lit-translate-cache.json';
const keysPath = '/tmp/lit-keys.json';

const src = fs.readFileSync(catalogPath, 'utf8');
const enBlock = src.match(/export const litEn: LiteralMap = \{([\s\S]*?)\n\};\n\nexport const litPt/);
if (!enBlock) throw new Error('litEn block not found');
const keyRe = /^\s+'((?:\\'|[^'])*)'\s*:\s*'((?:\\'|[^'])*)'/gm;
const keys = [];
let m;
while ((m = keyRe.exec(enBlock[1]))) keys.push(m[1].replace(/\\'/g, "'"));
fs.writeFileSync(keysPath, JSON.stringify(keys));

const cache = fs.existsSync(cachePath)
  ? JSON.parse(fs.readFileSync(cachePath, 'utf8'))
  : { pt: {}, es: {}, fr: {} };

function looksNonTranslatable(s) {
  if (!s || s.length <= 1) return true;
  if (/^https?:\/\//i.test(s)) return true;
  if (/^#[0-9A-Fa-f]{3,8}$/.test(s)) return true;
  if (/^[0-9]+([.,][0-9]+)?%?$/.test(s)) return true;
  if (/^x{2,}(-x+)+\b/i.test(s)) return true;
  if (/^[\w./:-]+$/.test(s) && !/[a-z]{3,}/i.test(s)) return true;
  return false;
}

const exact = {
  pt: JSON.parse(fs.readFileSync(new URL('./i18n-exact-pt.json', import.meta.url), 'utf8')),
  es: JSON.parse(fs.readFileSync(new URL('./i18n-exact-es.json', import.meta.url), 'utf8')),
  fr: JSON.parse(fs.readFileSync(new URL('./i18n-exact-fr.json', import.meta.url), 'utf8')),
};

const words = {
  pt: [
    ['Organizations', 'Organizações'], ['Organization', 'Organização'],
    ['Organisations', 'Organizações'], ['Organisation', 'Organização'],
    ['Applications', 'Aplicações'], ['Application', 'Aplicação'],
    ['Allocations', 'Alocações'], ['Allocation', 'Alocação'],
    ['Notifications', 'Notificações'], ['Notification', 'Notificação'],
    ['Permissions', 'Permissões'], ['Permission', 'Permissão'],
    ['Descriptions', 'Descrições'], ['Description', 'Descrição'],
    ['Attachments', 'Anexos'], ['Attachment', 'Anexo'],
    ['Customers', 'Clientes'], ['Customer', 'Cliente'],
    ['Projects', 'Projetos'], ['Project', 'Projeto'],
    ['Utilizadores', 'Utilizadores'],
    ['Users', 'Utilizadores'], ['User', 'Utilizador'],
    ['Tasks', 'Tarefas'], ['Task', 'Tarefa'],
    ['Versions', 'Versões'], ['Version', 'Versão'],
    ['Members', 'Membros'], ['Member', 'Membro'],
    ['Entries', 'Registos'], ['Entry', 'Registo'],
    ['Records', 'Registos'], ['Record', 'Registo'],
    ['Comments', 'Comentários'], ['Comment', 'Comentário'],
    ['Expenses', 'Despesas'], ['Expense', 'Despesa'],
    ['Holidays', 'Feriados'], ['Holiday', 'Feriado'],
    ['Vacations', 'Férias'], ['Vacation', 'Férias'],
    ['Approvals', 'Aprovações'], ['Approval', 'Aprovação'],
    ['Settings', 'Definições'], ['Dashboard', 'Painel'],
    ['Planning', 'Planeamento'], ['Timesheet', 'Folha de horas'],
    ['Reporting', 'Relatórios'], ['Report', 'Relatório'],
    ['Overview', 'Visão geral'], ['Summary', 'Resumo'],
    ['Details', 'Detalhes'], ['Actions', 'Ações'], ['Action', 'Ação'],
    ['Status', 'Estado'], ['Priority', 'Prioridade'], ['Priorities', 'Prioridades'],
    ['Assignee', 'Responsável'], ['Assignees', 'Responsáveis'],
    ['Password', 'Palavra-passe'], ['Username', 'Nome de utilizador'],
    ['Email', 'E-mail'], ['Language', 'Idioma'], ['Theme', 'Tema'],
    ['Loading', 'A carregar'], ['Saving', 'A guardar'], ['Deleting', 'A eliminar'],
    ['Pending', 'Pendente'], ['Approved', 'Aprovado'], ['Rejected', 'Rejeitado'],
    ['Completed', 'Concluído'], ['Active', 'Ativo'], ['Inactive', 'Inativo'],
    ['Enabled', 'Ativado'], ['Disabled', 'Desativado'],
    ['Required', 'Obrigatório'], ['Optional', 'Opcional'],
    ['Selected', 'Selecionado'], ['Select', 'Selecionar'],
    ['Search', 'Pesquisar'], ['Filter', 'Filtrar'], ['Filters', 'Filtros'],
    ['Export', 'Exportar'], ['Import', 'Importar'],
    ['Download', 'Transferir'], ['Upload', 'Carregar'],
    ['Delete', 'Eliminar'], ['Remove', 'Remover'], ['Edit', 'Editar'],
    ['Create', 'Criar'], ['Update', 'Atualizar'], ['Save', 'Guardar'],
    ['Cancel', 'Cancelar'], ['Close', 'Fechar'], ['Open', 'Abrir'],
    ['Add', 'Adicionar'], ['Show', 'Mostrar'], ['Hide', 'Ocultar'],
    ['View', 'Ver'], ['Manage', 'Gerir'], ['Clear', 'Limpar'],
    ['Apply', 'Aplicar'], ['Reset', 'Repor'], ['Back', 'Voltar'],
    ['Next', 'Seguinte'], ['Previous', 'Anterior'], ['Continue', 'Continuar'],
    ['Confirm', 'Confirmar'], ['Submit', 'Submeter'],
    ['Hours', 'Horas'], ['Days', 'Dias'], ['Day', 'Dia'],
    ['Week', 'Semana'], ['Month', 'Mês'], ['Year', 'Ano'], ['Today', 'Hoje'],
    ['Date', 'Data'], ['Name', 'Nome'], ['Type', 'Tipo'], ['Types', 'Tipos'],
    ['Category', 'Categoria'], ['Categories', 'Categorias'],
    ['Team', 'Equipa'], ['Teams', 'Equipas'], ['Role', 'Função'], ['Roles', 'Funções'],
    ['Notes', 'Notas'], ['Note', 'Nota'], ['Title', 'Título'],
    ['Start', 'Início'], ['End', 'Fim'], ['From', 'De'], ['To', 'Até'],
    ['Total', 'Total'], ['Average', 'Média'], ['Count', 'Contagem'],
    ['None', 'Nenhum'], ['All', 'Todos'], ['New', 'Novo'], ['More', 'Mais'],
    ['Less', 'Menos'], ['Help', 'Ajuda'], ['Error', 'Erro'],
    ['Success', 'Sucesso'], ['Warning', 'Aviso'], ['Info', 'Informação'],
    ['Yes', 'Sim'], ['No', 'Não'], ['or', 'ou'], ['and', 'e'],
    ['with', 'com'], ['without', 'sem'], ['for', 'para'], ['of', 'de'],
    ['in', 'em'], ['on', 'em'], ['at', 'em'], ['by', 'por'],
    ['from', 'de'],  
    ['your', 'o seu'], ['my', 'o meu'], ['this', 'este'], ['that', 'esse'],
    ['available', 'disponível'], ['unavailable', 'indisponível'],
    ['configured', 'configurado'], ['unconfigured', 'não configurado'],
    ['template', 'modelo'], ['Template', 'Modelo'],
    ['file', 'ficheiro'], ['File', 'Ficheiro'], ['files', 'ficheiros'], ['Files', 'Ficheiros'],
    ['column', 'coluna'], ['Column', 'Coluna'], ['columns', 'colunas'], ['Columns', 'Colunas'],
    ['row', 'linha'], ['Row', 'Linha'], ['rows', 'linhas'], ['Rows', 'Linhas'],
    ['field', 'campo'], ['Field', 'Campo'], ['fields', 'campos'], ['Fields', 'Campos'],
    ['value', 'valor'], ['Value', 'Valor'], ['values', 'valores'], ['Values', 'Valores'],
    ['default', 'predefinição'], ['Default', 'Predefinição'],
    ['custom', 'personalizado'], ['Custom', 'Personalizado'],
    ['internal', 'interno'], ['Internal', 'Interno'],
    ['external', 'externo'], ['External', 'Externo'],
    ['global', 'global'], ['Global', 'Global'],
    ['empty', 'vazio'], ['Empty', 'Vazio'],
    ['found', 'encontrado'], ['Found', 'Encontrado'],
    ['missing', 'em falta'], ['Missing', 'Em falta'],
    ['invalid', 'inválido'], ['Invalid', 'Inválido'],
    ['valid', 'válido'], ['Valid', 'Válido'],
    ['enabled', 'ativado'], ['disabled', 'desativado'],
    ['true', 'verdadeiro'], ['false', 'falso'],
    ['manual', 'manual'], ['Manual', 'Manual'],
    ['automatic', 'automático'], ['Automatic', 'Automático'],
    ['Auto', 'Auto'], ['auto', 'auto'],
    ['Timer', 'Temporizador'], ['timer', 'temporizador'],
    ['Call', 'Chamada'], ['Calls', 'Chamadas'],
    ['Ticket', 'Ticket'], ['Tickets', 'Tickets'],
    ['Memo', 'Memo'], ['Memos', 'Memos'],
    ['Sprint', 'Sprint'], ['Sprints', 'Sprints'],
    ['Release', 'Lançamento'], ['Releases', 'Lançamentos'],
    ['Commit', 'Commit'], ['Commits', 'Commits'],
    ['Branch', 'Branch'], ['Branches', 'Branches'],
    ['Repository', 'Repositório'], ['Repositories', 'Repositórios'],
    ['Integration', 'Integração'], ['Integrations', 'Integrações'],
    ['Configuration', 'Configuração'], ['Configurations', 'Configurações'],
    ['Preference', 'Preferência'], ['Preferences', 'Preferências'],
    ['Profile', 'Perfil'], ['Account', 'Conta'],
    ['Admin', 'Admin'], ['Administration', 'Administração'],
    ['Home', 'Início'], ['Calendar', 'Calendário'],
    ['Duration', 'Duração'], ['Time', 'Tempo'],
    ['Worked', 'Trabalhado'], ['Allocated', 'Alocado'],
    ['Planned', 'Planeado'], ['Unplanned', 'Não planeado'],
    ['Overdue', 'Em atraso'], ['Milestone', 'Marco'], ['Milestones', 'Marcos'],
    ['Dependency', 'Dependência'], ['Dependencies', 'Dependências'],
    ['Parent', 'Pai'], ['Child', 'Filho'], ['Children', 'Filhos'],
    ['Subtask', 'Subtarefa'], ['Subtasks', 'Subtarefas'],
    ['Tag', 'Etiqueta'], ['Tags', 'Etiquetas'],
    ['Color', 'Cor'], ['Colour', 'Cor'],
    ['Icon', 'Ícone'], ['Logo', 'Logótipo'],
    ['Url', 'URL'], ['URL', 'URL'],
    ['Link', 'Ligação'], ['Links', 'Ligações'],
    ['Message', 'Mensagem'], ['Messages', 'Mensagens'],
    ['History', 'Histórico'], ['Audit', 'Auditoria'],
    ['Rate', 'Taxa'], ['Percent', 'Percentagem'],
    ['Average', 'Média'], ['Sum', 'Soma'],
    ['Min', 'Mín'], ['Max', 'Máx'],
    ['Sort', 'Ordenar'], ['Order', 'Ordem'],
    ['Ascending', 'Ascendente'], ['Descending', 'Descendente'],
    ['Group', 'Grupo'], ['Groups', 'Grupos'],
    ['By', 'Por'], ['Per', 'Por'],
    ['Range', 'Intervalo'], ['Period', 'Período'],
    ['Last', 'Últimos'], ['First', 'Primeiro'],
    ['Current', 'Atual'], ['Previous', 'Anterior'],
    ['Next', 'Seguinte'],
    ['Owner', 'Proprietário'], ['Created', 'Criado'], ['Updated', 'Atualizado'],
    ['Deleted', 'Eliminado'], ['Assigned', 'Atribuído'],
    ['Unassigned', 'Não atribuído'], ['Assign', 'Atribuir'],
    ['Move', 'Mover'], ['Copy', 'Copiar'], ['Duplicate', 'Duplicar'],
    ['Rename', 'Mudar o nome'], ['Replace', 'Substituir'],
    ['Preview', 'Pré-visualizar'], ['Print', 'Imprimir'],
    ['Refresh', 'Atualizar'], ['Reload', 'Recarregar'],
    ['Collapse', 'Contrair'], ['Expand', 'Expandir'],
    ['Fullscreen', 'Ecrã inteiro'], ['Fullscreen', 'Ecrã inteiro'],
    ['Compact', 'Compacto'], ['Comfortable', 'Confortável'],
    ['Fixed', 'Fixo'], ['Grow', 'Expandir'],
    ['Hidden', 'Oculto'], ['Visible', 'Visível'],
    ['Public', 'Público'], ['Private', 'Privado'],
    ['Draft', 'Rascunho'], ['Published', 'Publicado'], ['Released', 'Publicado'],
    ['Development', 'Desenvolvimento'], ['Production', 'Produção'],
    ['Test', 'Teste'], ['Tests', 'Testes'],
    ['Failed', 'Falhou'], ['Passed', 'Passou'],
    ['Running', 'Em execução'], ['Stopped', 'Parado'],
    ['Start', 'Início'], ['Stop', 'Parar'],
    ['Pause', 'Pausa'], ['Resume', 'Retomar'],
    ['Send', 'Enviar'], ['Receive', 'Receber'],
    ['Invite', 'Convidar'], ['Invitation', 'Convite'],
    ['Accept', 'Aceitar'], ['Decline', 'Recusar'],
    ['Approve', 'Aprovar'], ['Reject', 'Rejeitar'],
    ['Request', 'Pedido'], ['Requests', 'Pedidos'],
    ['Waiting', 'A aguardar'], ['awaiting', 'a aguardar'],
    ['approval', 'aprovação'], ['approved', 'aprovado'],
    ['rejected', 'rejeitado'], ['pending', 'pendente'],
    ['results', 'resultados'], ['result', 'resultado'],
    ['data', 'dados'], ['items', 'itens'], ['item', 'item'],
    ['list', 'lista'], ['table', 'tabela'], ['chart', 'gráfico'],
    ['graph', 'gráfico'], ['board', 'quadro'], ['kanban', 'kanban'],
    ['gantt', 'gantt'], ['timeline', 'cronograma'],
    ['schedule', 'calendário'], ['schedules', 'calendários'],
    ['capacity', 'capacidade'], ['availability', 'disponibilidade'],
    ['workload', 'carga de trabalho'], ['progress', 'progresso'],
    ['percent', 'percentagem'], ['percentage', 'percentagem'],
    ['complete', 'concluir'], ['completed', 'concluído'],
    ['incomplete', 'incompleto'], ['remaining', 'restante'],
    ['overdue', 'em atraso'], ['due', 'vencimento'],
    ['deadline', 'prazo'], ['estimate', 'estimativa'],
    ['estimated', 'estimado'], ['actual', 'real'],
    ['budget', 'orçamento'], ['cost', 'custo'], ['costs', 'custos'],
    ['billable', 'faturável'], ['non-billable', 'não faturável'],
    ['invoice', 'fatura'], ['billing', 'faturação'],
    ['currency', 'moeda'], ['amount', 'montante'],
    ['quantity', 'quantidade'], ['unit', 'unidade'],
    ['price', 'preço'], ['rate', 'taxa'],
    ['tax', 'imposto'], ['total', 'total'],
    ['subtotal', 'subtotal'], ['discount', 'desconto'],
    ['include', 'incluir'], ['exclude', 'excluir'],
    ['including', 'incluindo'], ['excluding', 'excluindo'],
    ['only', 'apenas'], ['also', 'também'],
    ['already', 'já'], ['still', 'ainda'],
    ['yet', 'ainda'], ['now', 'agora'],
    ['here', 'aqui'], ['there', 'ali'],
    ['above', 'acima'], ['below', 'abaixo'],
    ['left', 'esquerda'], ['right', 'direita'],
    ['top', 'topo'], ['bottom', 'fundo'],
    ['center', 'centro'], ['middle', 'meio'],
    ['full', 'completo'], ['half', 'meio'],
    ['empty', 'vazio'], ['blank', 'em branco'],
    ['required', 'obrigatório'], ['optional', 'opcional'],
    ['please', 'por favor'], ['sorry', 'desculpe'],
    ['try', 'tentar'], ['again', 'novamente'],
    ['later', 'mais tarde'], ['soon', 'em breve'],
    ['never', 'nunca'], ['always', 'sempre'],
    ['sometimes', 'por vezes'], ['often', 'frequentemente'],
    
    
    
    
    
    
    
    
    
    ["can't", 'não pode'], ["won't", 'não irá'],
    
    ['about', 'sobre'], ['over', 'sobre'], ['under', 'sob'],
    ['between', 'entre'], ['among', 'entre'],
    ['during', 'durante'], ['before', 'antes'], ['after', 'depois'],
    ['until', 'até'], ['since', 'desde'],
    ['while', 'enquanto'], ['when', 'quando'], ['where', 'onde'],
    ['which', 'que'], ['who', 'quem'], ['what', 'o que'],
    ['how', 'como'], ['why', 'porque'],
    
    
    
    ['using', 'usando'], ['used', 'usado'],
    ['based', 'com base'], ['according', 'de acordo'],
    ['related', 'relacionado'], ['associated', 'associado'],
    ['linked', 'associado'], ['connected', 'ligado'],
    ['selected', 'selecionado'], ['checked', 'marcado'],
    ['unchecked', 'desmarcado'], ['toggled', 'alternado'],
    ['changed', 'alterado'], ['modified', 'modificado'],
    ['saved', 'guardado'], ['unsaved', 'não guardado'],
    ['discarded', 'descartado'], ['restored', 'restaurado'],
    ['archived', 'arquivado'], ['unarchived', 'restaurado'],
    ['published', 'publicado'], ['unpublished', 'não publicado'],
    ['shared', 'partilhado'], ['unshared', 'não partilhado'],
    ['locked', 'bloqueado'], ['unlocked', 'desbloqueado'],
    ['protected', 'protegido'], ['unprotected', 'desprotegido'],
    ['secure', 'seguro'], ['insecure', 'inseguro'],
    ['private', 'privado'], ['public', 'público'],
    ['internal', 'interno'], ['external', 'externo'],
  ],
  es: [
    ['Organizations', 'Organizaciones'], ['Organization', 'Organización'],
    ['Organisations', 'Organizaciones'], ['Organisation', 'Organización'],
    ['Applications', 'Aplicaciones'], ['Application', 'Aplicación'],
    ['Allocations', 'Asignaciones'], ['Allocation', 'Asignación'],
    ['Customers', 'Clientes'], ['Customer', 'Cliente'],
    ['Projects', 'Proyectos'], ['Project', 'Proyecto'],
    ['Users', 'Usuarios'], ['User', 'Usuario'],
    ['Tasks', 'Tareas'], ['Task', 'Tarea'],
    ['Versions', 'Versiones'], ['Version', 'Versión'],
    ['Members', 'Miembros'], ['Member', 'Miembro'],
    ['Entries', 'Registros'], ['Entry', 'Registro'],
    ['Approvals', 'Aprobaciones'], ['Settings', 'Ajustes'],
    ['Dashboard', 'Panel'], ['Planning', 'Planificación'],
    ['Timesheet', 'Parte de horas'], ['Description', 'Descripción'],
    ['Actions', 'Acciones'], ['Action', 'Acción'],
    ['Status', 'Estado'], ['Priority', 'Prioridad'],
    ['Loading', 'Cargando'], ['Pending', 'Pendiente'],
    ['Approved', 'Aprobado'], ['Rejected', 'Rechazado'],
    ['Search', 'Buscar'], ['Filter', 'Filtrar'],
    ['Export', 'Exportar'], ['Import', 'Importar'],
    ['Download', 'Descargar'], ['Upload', 'Subir'],
    ['Delete', 'Eliminar'], ['Edit', 'Editar'], ['Create', 'Crear'],
    ['Update', 'Actualizar'], ['Save', 'Guardar'], ['Cancel', 'Cancelar'],
    ['Close', 'Cerrar'], ['Open', 'Abrir'], ['Add', 'Añadir'],
    ['Remove', 'Quitar'], ['Show', 'Mostrar'], ['Hide', 'Ocultar'],
    ['View', 'Ver'], ['Manage', 'Gestionar'], ['Select', 'Seleccionar'],
    ['All', 'Todos'], ['None', 'Ninguno'], ['Hours', 'Horas'],
    ['Date', 'Fecha'], ['Name', 'Nombre'], ['Type', 'Tipo'],
    ['Team', 'Equipo'], ['Notes', 'Notas'], ['Total', 'Total'],
    ['New', 'Nuevo'], ['More', 'Más'], ['Yes', 'Sí'], ['No', 'No'],
    ['and', 'y'], ['or', 'o'], ['with', 'con'], ['without', 'sin'],
    ['for', 'para'], ['of', 'de'], ['in', 'en'], ['to', 'a'],
    ['from', 'desde'], ['Active', 'Activo'], ['Completed', 'Completado'],
  ],
  fr: [
    ['Organizations', 'Organisations'], ['Organization', 'Organisation'],
    ['Organisations', 'Organisations'], ['Organisation', 'Organisation'],
    ['Applications', 'Applications'], ['Application', 'Application'],
    ['Allocations', 'Allocations'], ['Allocation', 'Allocation'],
    ['Customers', 'Clients'], ['Customer', 'Client'],
    ['Projects', 'Projets'], ['Project', 'Projet'],
    ['Users', 'Utilisateurs'], ['User', 'Utilisateur'],
    ['Tasks', 'Tâches'], ['Task', 'Tâche'],
    ['Versions', 'Versions'], ['Version', 'Version'],
    ['Members', 'Membres'], ['Member', 'Membre'],
    ['Entries', 'Entrées'], ['Entry', 'Entrée'],
    ['Approvals', 'Approbations'], ['Settings', 'Paramètres'],
    ['Dashboard', 'Tableau de bord'], ['Planning', 'Planification'],
    ['Timesheet', 'Feuille de temps'], ['Description', 'Description'],
    ['Actions', 'Actions'], ['Action', 'Action'],
    ['Status', 'Statut'], ['Priority', 'Priorité'],
    ['Loading', 'Chargement'], ['Pending', 'En attente'],
    ['Approved', 'Approuvé'], ['Rejected', 'Rejeté'],
    ['Search', 'Rechercher'], ['Filter', 'Filtrer'],
    ['Export', 'Exporter'], ['Import', 'Importer'],
    ['Download', 'Télécharger'], ['Upload', 'Téléverser'],
    ['Delete', 'Supprimer'], ['Edit', 'Modifier'], ['Create', 'Créer'],
    ['Update', 'Mettre à jour'], ['Save', 'Enregistrer'], ['Cancel', 'Annuler'],
    ['Close', 'Fermer'], ['Open', 'Ouvrir'], ['Add', 'Ajouter'],
    ['Remove', 'Retirer'], ['Show', 'Afficher'], ['Hide', 'Masquer'],
    ['View', 'Voir'], ['Manage', 'Gérer'], ['Select', 'Sélectionner'],
    ['All', 'Tous'], ['None', 'Aucun'], ['Hours', 'Heures'],
    ['Date', 'Date'], ['Name', 'Nom'], ['Type', 'Type'],
    ['Team', 'Équipe'], ['Notes', 'Notes'], ['Total', 'Total'],
    ['New', 'Nouveau'], ['More', 'Plus'], ['Yes', 'Oui'], ['No', 'Non'],
    ['and', 'et'], ['or', 'ou'], ['with', 'avec'], ['without', 'sans'],
    ['for', 'pour'], ['of', 'de'], ['in', 'dans'], ['to', 'à'],
    ['from', 'de'], ['Active', 'Actif'], ['Completed', 'Terminé'],
  ],
};

const patterns = {
  pt: [
    [/^Add (.+)$/i, (_, a) => `Adicionar ${a}`],
    [/^Create (.+)$/i, (_, a) => `Criar ${a}`],
    [/^Edit (.+)$/i, (_, a) => `Editar ${a}`],
    [/^Delete (.+)$/i, (_, a) => `Eliminar ${a}`],
    [/^Remove (.+)$/i, (_, a) => `Remover ${a}`],
    [/^Search (.+)\.?$/i, (_, a) => `Pesquisar ${a}`],
    [/^Select (.+)\.?$/i, (_, a) => `Selecionar ${a}`],
    [/^All (.+)$/i, (_, a) => `Todos os ${a}`],
    [/^No (.+) yet\.?$/i, (_, a) => `Ainda sem ${a}.`],
    [/^No (.+)\.?$/i, (_, a) => `Sem ${a}.`],
    [/^Loading (.+)\.?$/i, (_, a) => `A carregar ${a}…`],
    [/^Manage (.+)$/i, (_, a) => `Gerir ${a}`],
    [/^View (.+)$/i, (_, a) => `Ver ${a}`],
    [/^Open (.+)$/i, (_, a) => `Abrir ${a}`],
    [/^Download (.+)$/i, (_, a) => `Transferir ${a}`],
    [/^Import (.+)$/i, (_, a) => `Importar ${a}`],
    [/^Export (.+)$/i, (_, a) => `Exportar ${a}`],
    [/^Active (.+)$/i, (_, a) => `${a} ativos`],
    [/^Total (.+)$/i, (_, a) => `Total de ${a}`],
    [/^Show (.+)$/i, (_, a) => `Mostrar ${a}`],
    [/^Hide (.+)$/i, (_, a) => `Ocultar ${a}`],
    [/^Save (.+)$/i, (_, a) => `Guardar ${a}`],
    [/^Update (.+)$/i, (_, a) => `Atualizar ${a}`],
    [/^Clear (.+)$/i, (_, a) => `Limpar ${a}`],
    [/^Filter by (.+)$/i, (_, a) => `Filtrar por ${a}`],
    [/^Sort by (.+)$/i, (_, a) => `Ordenar por ${a}`],
    [/^Group by (.+)$/i, (_, a) => `Agrupar por ${a}`],
    [/^Are you sure\??$/i, () => 'Tem a certeza?'],
    [/^\.\.\.loading$/i, () => '…a carregar'],
  ],
  es: [
    [/^Add (.+)$/i, (_, a) => `Añadir ${a}`],
    [/^Create (.+)$/i, (_, a) => `Crear ${a}`],
    [/^Edit (.+)$/i, (_, a) => `Editar ${a}`],
    [/^Delete (.+)$/i, (_, a) => `Eliminar ${a}`],
    [/^All (.+)$/i, (_, a) => `Todos os ${a}`],
    [/^No (.+) yet\.?$/i, (_, a) => `Aún sin ${a}.`],
    [/^No (.+)\.?$/i, (_, a) => `Sin ${a}.`],
    [/^Loading (.+)\.?$/i, (_, a) => `Cargando ${a}…`],
    [/^Active (.+)$/i, (_, a) => `${a} activos`],
    [/^Total (.+)$/i, (_, a) => `Total de ${a}`],
  ],
  fr: [
    [/^Add (.+)$/i, (_, a) => `Ajouter ${a}`],
    [/^Create (.+)$/i, (_, a) => `Créer ${a}`],
    [/^Edit (.+)$/i, (_, a) => `Modifier ${a}`],
    [/^Delete (.+)$/i, (_, a) => `Supprimer ${a}`],
    [/^All (.+)$/i, (_, a) => `Tous : ${a}`],
    [/^No (.+) yet\.?$/i, (_, a) => `Pas encore de ${a}.`],
    [/^No (.+)\.?$/i, (_, a) => `Aucun ${a}.`],
    [/^Loading (.+)\.?$/i, (_, a) => `Chargement de ${a}…`],
    [/^Active (.+)$/i, (_, a) => `${a} actifs`],
    [/^Total (.+)$/i, (_, a) => `Total de ${a}`],
  ],
};

function applyWords(text, lang) {
  let out = text;
  const list = words[lang] || [];
  // longest first
  const sorted = [...list].sort((a, b) => b[0].length - a[0].length);
  for (const [en, tr] of sorted) {
    if (!en) continue;
    if (en.length <= 2) continue; // avoid mangling 'a','to','in',...
    const re = new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    out = out.replace(re, tr);
  }
  // cleanup double spaces and empty the artifacts
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.,:;!?])/g, '$1').trim();
  out = out.replace(/^:\s*/, '').replace(/\s+:/g, ':');
  // gender fixes PT
  if (lang === 'pt') {
    out = out
      .replace(/\bTodos: Projetos\b/g, 'Todos os projetos')
      .replace(/\bTodos: Tarefas\b/g, 'Todas as tarefas')
      .replace(/\bTodos: Utilizadores\b/g, 'Todos os utilizadores')
      .replace(/\bTodos: Clientes\b/g, 'Todos os clientes')
      .replace(/\bTodos: Aplicações\b/g, 'Todas as aplicações')
      .replace(/\bTodos: Versões\b/g, 'Todas as versões')
      .replace(/\bTodos: Organizações\b/g, 'Todas as organizações')
      .replace(/\bTodos: Estados\b/g, 'Todos os estados')
      .replace(/\bTodos: Membros\b/g, 'Todos os membros')
      .replace(/\bProjetos ativos\b/gi, 'Projetos ativos')
      .replace(/\bUtilizadores ativos\b/gi, 'Utilizadores ativos')
      .replace(/\bum um\b/g, 'um')
      .replace(/\bo o seu\b/g, 'o seu')
      .replace(/\bo o meu\b/g, 'o meu');
  }
  return out;
}

function translate(text, lang) {
  if (looksNonTranslatable(text)) return text;
  if (exact[lang][text]) return applyWords(exact[lang][text], lang);
  const cached = cache[lang]?.[text];
  if (cached && cached !== text && !/MYMEMORY WARNING|QUERY LENGTH/i.test(cached)) {
    // still run word pass to fix leftovers like "Adicionar Customer"
    return applyWords(cached, lang);
  }
  let t = text;
  for (const [re, fn] of patterns[lang] || []) {
    if (re.test(t)) {
      t = t.replace(re, fn);
      break;
    }
  }
  t = applyWords(t, lang);
  return t || text;
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const maps = { pt: {}, es: {}, fr: {} };
for (const lang of ['pt', 'es', 'fr']) {
  for (const key of keys) maps[lang][key] = translate(key, lang);
}

const emit = (name, map) => {
  const lines = keys.map((k) => `  '${esc(k)}': '${esc(map[k] ?? k)}',`);
  return `export const ${name}: LiteralMap = {\n${lines.join('\n')}\n};\n`;
};

const header =
  '/** Auto-generated UI literals for title/aria-label/placeholder and JSX chrome. */\n' +
  'export type LiteralMap = Record<string, string>;\n\n';
const enMap = Object.fromEntries(keys.map((k) => [k, k]));
const out =
  header +
  emit('litEn', enMap) +
  '\n' +
  emit('litPt', maps.pt) +
  '\n' +
  emit('litEs', maps.es) +
  '\n' +
  emit('litFr', maps.fr);

fs.writeFileSync(catalogPath, out);

for (const lang of ['pt', 'es', 'fr']) {
  let same = 0;
  let diff = 0;
  for (const k of keys) {
    if ((maps[lang][k] || k) === k) same++;
    else diff++;
  }
  console.log(lang, { same, diff, pct: Math.round((100 * diff) / keys.length) });
}
console.log('wrote', catalogPath, 'keys', keys.length);

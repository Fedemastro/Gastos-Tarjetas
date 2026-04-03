const SUPABASE_URL = 'https://TU_PROJECT.supabase.co';
const SUPABASE_KEY = 'TU_ANON_KEY';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------- AUTH ----------

async function signUp(email, password) {
  return await supabase.auth.signUp({ email, password });
}

async function signIn(email, password) {
  return await supabase.auth.signInWithPassword({ email, password });
}

async function signOut() {
  return await supabase.auth.signOut();
}

async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

// ---------- DATA ----------

async function getCards() {
  return (await supabase.from('cards').select('*')).data;
}

async function addCard(name) {
  const user = await getUser();
  return await supabase.from('cards').insert({ name, user_id: user.id });
}

async function getExpenses() {
  return (await supabase.from('expenses').select('*')).data;
}

async function addExpense(exp) {
  const user = await getUser();
  return await supabase.from('expenses').insert({
    ...exp,
    user_id: user.id
  });
}

async function getCategories() {
  return (await supabase.from('categories').select('*')).data;
}

async function addCategory(name) {
  const user = await getUser();
  return await supabase.from('categories').insert({
    name,
    user_id: user.id
  });
}
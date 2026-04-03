async function handleLogin() {
  const email = document.getElementById('email').value;
  const pass  = document.getElementById('password').value;

  const { error } = await signIn(email, pass);

  if (error) {
    alert(error.message);
  } else {
    startApp();
  }
}

async function handleSignup() {
  const email = document.getElementById('email').value;
  const pass  = document.getElementById('password').value;

  const { error } = await signUp(email, pass);

  if (error) alert(error.message);
  else alert('Usuario creado!');
}

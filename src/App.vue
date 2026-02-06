<template>
  <div class="container">
    <img alt="WebMiner logo" class="logo" src="/logo.png" height="45" />
    <div class="content">
      <router-view />
    </div>
  </div>
</template>

<script setup>
// Main layout component
</script>

<style>
/* Global layout styles */
body {
  background: #f5f5f5;
  height: 100vh;
  margin: 0;
}

.container {
  max-width: 992px;
  margin: auto;
  padding-left: 15px;
  padding-right: 15px;
  padding-top: 30px;
}

.logo {
  margin-left: auto;
  margin-right: auto;
  display: block;
  margin-bottom: 1rem;
}

.content {
  /* Content wrapper */
}
</style>

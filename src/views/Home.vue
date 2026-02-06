<template>
  <div class="home">
    <a-row :gutter="30" justify="center">
      <a-col :xs="24" :sm="24" :md="24" :lg="24" :xl="12" :xxl="12">
        <div class="block">
          <a-divider>Information</a-divider>
          <div style="background-color: #ececec; padding: 20px;">
            <a-card title="Configuration" :bordered="false">
              <h3 class="text-center">
                <a-typography-text type="success" strong>Dev Fee: 2%</a-typography-text>
              </h3>
              <div v-if="started" class="text-center mb-3">
                 <a-tag :color="statusColor">{{ connectionStatus }}</a-tag>
              </div>
              
              <a-form
                :model="formState"
                name="basic"
                :label-col="{ span: 6 }"
                :wrapper-col="{ span: 18 }"
                autocomplete="off"
                :disabled="started"
                @finish="onFinish"
              >
                <a-form-item
                  label="Algorithm"
                  name="algorithm"
                  :rules="[{ required: true, message: 'Please select an algorithm!' }]"
                >
                  <a-select v-model:value="formState.algorithm" placeholder="Algorithm">
                    <a-select-option value="power2b">power2b</a-select-option>
                    <a-select-option value="yespower">yespower</a-select-option>
                    <a-select-option value="cpupower">cpupower</a-select-option>
                  </a-select>
                </a-form-item>

                <a-form-item
                  label="Host"
                  name="host"
                  :rules="[{ required: true, message: 'Please input host!' }]"
                >
                  <a-input v-model:value="formState.host" placeholder="Pool Host" />
                </a-form-item>

                <a-form-item
                  label="Port"
                  name="port"
                  :rules="[{ required: true, message: 'Please input port!' }]"
                >
                  <a-input-number v-model:value="formState.port" placeholder="Pool Port" style="width: 100%" />
                </a-form-item>

                <a-form-item
                  label="Wallet"
                  name="worker"
                  :rules="[{ required: true, message: 'Please input wallet!' }]"
                >
                  <a-input v-model:value="formState.worker" placeholder="Wallet Address" />
                </a-form-item>

                <a-form-item
                  label="Password"
                  name="password"
                >
                  <a-input v-model:value="formState.password" placeholder="x" />
                </a-form-item>

                <a-form-item
                  label="Threads"
                  name="workers"
                  help="If you use multiple threads, your computer may slow down."
                >
                  <a-input-number 
                    v-model:value="formState.workers" 
                    :min="1" 
                    :max="128" 
                    placeholder="Threads"
                    style="width: 100%" 
                  />
                </a-form-item>

                <a-form-item :wrapper-col="{ offset: 6, span: 18 }">
                  <a-button type="primary" html-type="submit" v-if="!started" block>Start Mining</a-button>
                  <a-button type="primary" danger html-type="button" v-else @click="stopMining" block>Stop Mining</a-button>
                </a-form-item>
              </a-form>

              <div class="text-center" v-if="minerUrl">
                <span class="url">{{ minerUrl }}</span>
              </div>
            </a-card>
          </div>
        </div>
      </a-col>

      <a-col :xs="24" :sm="24" :md="24" :lg="24" :xl="12" :xxl="12">
        <div class="block text-center">
          <a-divider>Worker</a-divider>
          <div style="background-color: #ececec; padding: 20px;">
            <a-row :gutter="16">
              <a-col :span="8">
                <a-card title="Hashrate" :bordered="false">
                  <a-typography-text type="success" strong id="hashrate">{{ stats.hashrate }} H/s</a-typography-text>
                </a-card>
              </a-col>
              <a-col :span="8">
                <a-card title="Shared" :bordered="false">
                  <a-typography-text type="success" strong id="shared">{{ stats.accepted }}</a-typography-text>
                </a-card>
              </a-col>
              <a-col :span="8">
                <a-card title="Reject" :bordered="false">
                  <a-typography-text type="danger" strong id="reject">{{ stats.rejected }}</a-typography-text>
                </a-card>
              </a-col>
            </a-row>
          </div>
        </div>

        <div class="block">
          <div style="background-color: #ececec; padding: 20px;">
            <a-card :bordered="false" class="text-center">
              <a-typography-text type="danger" strong>Support our website with a donation today to maintain this service!</a-typography-text>
              <a-descriptions bordered size="small" class="mt-3" :column="1">
                <a-descriptions-item label="BTC">
                  <a-typography-paragraph copyable>3FZbgi29cpjq2GjdwV8eyHuJJnkLtktZc5</a-typography-paragraph>
                </a-descriptions-item>
                <a-descriptions-item label="LTC">
                  <a-typography-paragraph copyable>M8k14Q5mJ7rejsE1X9t2y2WJ7i9mXz3W</a-typography-paragraph>
                </a-descriptions-item>
              </a-descriptions>
            </a-card>
          </div>
        </div>
      </a-col>
    </a-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import Miner from '../lib/miner';

const route = useRoute();
const router = useRouter();

const started = ref(false);
const connectionStatus = ref('Idle');
const statusColor = ref('default');

const formState = reactive({
  algorithm: 'power2b',
  host: '',
  port: 3333,
  worker: '',
  password: 'x',
  workers: navigator.hardwareConcurrency || 4
});

const stats = reactive({
  hashrate: 0,
  accepted: 0,
  rejected: 0
});

let minerInstance = null;

// Generate shareable URL
const minerUrl = computed(() => {
  const baseUrl = window.location.origin + window.location.pathname;
  const params = new URLSearchParams({
    algorithm: formState.algorithm,
    host: formState.host,
    port: formState.port,
    worker: formState.worker,
    password: formState.password,
    workers: formState.workers
  });
  return `${baseUrl}?${params.toString()}`;
});

const onFinish = (values) => {
  console.log('Success:', values);
  startMining(values);
};

const startMining = (config) => {
  if (minerInstance) return;
  
  started.value = true;
  connectionStatus.value = 'Connecting...';
  statusColor.value = 'processing';
  message.success('Mining started!');
  
  minerInstance = new Miner({
    ...config,
    proxy: 'wss://technical-dasha-devdev-ccf19728.koyeb.app' // Working Power2b proxy
  });

  minerInstance.on('status', (status) => {
    connectionStatus.value = status;
    if (status === 'Mining') statusColor.value = 'success';
    else if (status === 'Error' || status === 'Disconnected') statusColor.value = 'error';
    else statusColor.value = 'processing';
  });
  
  minerInstance.on('hashrate', (rate) => {
    stats.hashrate = parseFloat(rate).toFixed(2);
  });
  
  minerInstance.on('found_share', () => {
    stats.accepted++;
  });
  
  minerInstance.on('error', (err) => {
    console.error('Miner error:', err);
    message.error('Miner error: ' + (err.message || err));
    stopMining();
  });
  
  minerInstance.on('close', () => {
    stopMining();
  });

  minerInstance.start();
};

const stopMining = () => {
  started.value = false;
  if (minerInstance) {
    message.warning('Mining stopped');
    minerInstance.stop();
    minerInstance = null;
  }
};

onMounted(() => {
  // Check URL query parameters first (priority)
  const query = route.query;
  if (Object.keys(query).length > 0) {
    if (query.algorithm) formState.algorithm = query.algorithm;
    if (query.host) formState.host = query.host;
    if (query.port) formState.port = parseInt(query.port);
    if (query.worker) formState.worker = query.worker;
    if (query.password) formState.password = query.password;
    if (query.workers) formState.workers = parseInt(query.workers);
  } else {
    // Load from local storage if no query params
    const saved = localStorage.getItem('minerConfig');
    if (saved) {
      Object.assign(formState, JSON.parse(saved));
    }
  }

  // Save to local storage on change
  watch(formState, (newVal) => {
    localStorage.setItem('minerConfig', JSON.stringify(newVal));
  });
});

</script>

<style scoped>
.home {
  padding: 20px;
}
</style>

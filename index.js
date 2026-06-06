import { registerRootComponent } from 'expo';

import App from './App';

// SDK 53+ 不再使用 expo/AppEntry.js 默认入口，需在此处显式注册根组件。
registerRootComponent(App);

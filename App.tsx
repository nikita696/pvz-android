import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppRoot from './src/AppRoot';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppRoot />
    </SafeAreaProvider>
  );
}

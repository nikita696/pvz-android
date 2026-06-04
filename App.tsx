import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Dimensions, Platform } from 'react-native';

import AppRoot from './src/AppRoot';

const webInitialMetrics =
  Platform.OS === 'web'
    ? {
        frame: {
          x: 0,
          y: 0,
          width: Dimensions.get('window').width,
          height: Dimensions.get('window').height,
        },
        insets: {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        },
      }
    : undefined;

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={webInitialMetrics}>
      <AppRoot />
    </SafeAreaProvider>
  );
}

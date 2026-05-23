module.exports = {
  dependencies: {
    'react-native-gesture-handler': {
      platforms: {
        android: {
          packageImportPath:
            'import com.swmansion.gesturehandler.RNGestureHandlerPackage;',
          packageInstance: 'new RNGestureHandlerPackage()',
        },
      },
    },
  },
};

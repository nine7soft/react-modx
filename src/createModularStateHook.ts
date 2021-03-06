import { useState, useLayoutEffect } from "react";
import { combineReducers, Reducer, ReducersMapObject, Store } from "redux";
import { SagaMiddleware } from "redux-saga";
import { takeLatest, takeEvery } from "redux-saga/effects";
import { StateCallableMapObjectInterface, ReducerCallable, SagaCallable } from ".";

let reducers: ReducersMapObject = {};
let sagas: Array<string> = [];
const dispatchers: any = {};

function injectReducer(moduleName: string, reducer: Reducer, store: Store) {
  if (!reducers[moduleName]) {
    reducers[moduleName] = reducer;
    store.replaceReducer(combineReducers(reducers));
  }
}

function injectSaga(name: string, sagaConfig: any, sagaMiddleware: SagaMiddleware) {
  const { call:saga, effectCreator:effectCreatorName } = sagaConfig;
  
  const effectCreator = resolveEffectCreator(effectCreatorName);

  if (!sagas.includes(name)) {
    sagas.push(name);
    sagaMiddleware.run(function* () {
      yield effectCreator(name, saga);
    });
  }
}

function getState(moduleName: string, store: Store) {
  const state: any = store.getState();
  return state[moduleName];
}

function subscribe(moduleName: string, f: Function, store: Store) {
  let moduleState = getState(moduleName, store);
  return store.subscribe(() => moduleState !== getState(moduleName, store) && f((moduleState = getState(moduleName, store))));
}

function switchCallableType(callableName: string, stateCallableMapName: "reducers" | "sagas", callableMap: StateCallableMapObjectInterface) {
  const stateCallable: ReducerCallable | SagaCallable = callableMap[stateCallableMapName][callableName];
  const type: string = stateCallable.type;
  callableMap[stateCallableMapName][type] = stateCallable;
  delete callableMap[stateCallableMapName][callableName];

  return type;
}

function registerReducersDispatchers(callableMap: StateCallableMapObjectInterface, store: Store) {
  Object.keys(callableMap.reducers).forEach((callableName: string) => {
    const type = switchCallableType(callableName, "reducers", callableMap);
    dispatchers[callableName] = (payload: any) => store.dispatch({ type, payload });
  });
}

function registerSagasDispatchers(callableMap: StateCallableMapObjectInterface, sagaMiddleware: SagaMiddleware, store: Store) {
  Object.keys(callableMap.sagas).forEach((callableName: string) => {
    const type = switchCallableType(callableName, "sagas", callableMap);
    const sagaConfig = callableMap.sagas[type];
    injectSaga(type, sagaConfig, sagaMiddleware);
    dispatchers[callableName] = (payload: any) => store.dispatch({ type, payload });
  });
}

function resolveEffectCreator(effectCreatorName:string|undefined = undefined){

  if(!effectCreatorName){
    return takeLatest;
  }

  switch (effectCreatorName) {
    case "takeLatest":
      return takeLatest;

    case "takeEvery":
      return takeEvery;
  
    default:
      throw Error(`Unknown effect "${effectCreatorName}". Defualt effect is "takeLatest"`)
  }
}

function throwErrorIfStoreIsInvalid(store: Store) {
  if (!(store instanceof Object) || !("replaceReducer" in store)) {
    throw Error("Invalid store provided when calling createModularStateHook function.");
  }
}

function throwErrorIfSagaMiddlewareIsInvalid(sagaMiddleware: SagaMiddleware) {
  if (!(sagaMiddleware instanceof Object) || !("run" in sagaMiddleware)) {
    throw Error("Invalid saga middleware provided when calling createModularStateHook function.");
  }
}

function useModularState(moduleName: string, initialState: any, callableMap: StateCallableMapObjectInterface, store: Store, sagaMiddleware: SagaMiddleware) {
  //init reducers
  injectReducer(
    moduleName,
    (state = initialState, { type, payload }) => {
      const reducerObject = callableMap.reducers[type];
      return reducerObject ? reducerObject.call(state, payload) : state;
    },
    store
  );

  const [moduleState, setModuleState] = useState(() => getState(moduleName, store));
  useLayoutEffect(() => {
    let isMounted = true;
    subscribe(moduleName, (value: any) => {
      if (isMounted) {
        setModuleState(() => value);
      }
    }, store);

    return () => {
      isMounted = false;
    }
  }, [setModuleState]);

  registerReducersDispatchers(callableMap, store);
  registerSagasDispatchers(callableMap, sagaMiddleware, store);

  return [moduleState, dispatchers, { getState, subscribe }];
}

function createUseModularStateHook(store: Store, sagaMiddleware: SagaMiddleware) {
  throwErrorIfStoreIsInvalid(store);
  throwErrorIfSagaMiddlewareIsInvalid(sagaMiddleware);

  return (moduleName: string, initialState: any, callableMap: StateCallableMapObjectInterface) => {
    return useModularState(moduleName, initialState, callableMap, store, sagaMiddleware);
  };
}

export default createUseModularStateHook;

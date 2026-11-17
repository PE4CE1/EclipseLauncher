import { version } from '../../package.json'

export const APP_VERSION = version
export const APP_DISPLAY_VERSION = version
export const APP_INTRO_VERSION = version.split('.').slice(0, 2).join('.')

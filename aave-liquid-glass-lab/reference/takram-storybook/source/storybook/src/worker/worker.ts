import workerpool from 'workerpool'

import { computeCreasedNormalAttribute } from './tasks/computeCreasedNormalAttribute'

export const methods = { computeCreasedNormalAttribute }

workerpool.worker(methods)

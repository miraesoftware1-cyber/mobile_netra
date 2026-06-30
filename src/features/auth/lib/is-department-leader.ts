export function isDepartmentLeader(leaderFlag: string | undefined) {
  return leaderFlag?.toUpperCase() === 'Y';
}

const UNNAMED_WORKOUT = 'Workout';

export function workoutName(workout: { readonly name: null | string }): string {
    return workout.name ?? UNNAMED_WORKOUT;
}

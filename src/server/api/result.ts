export default interface Result<DataType> {
    data?: DataType;
    status?: number;
    error?: unknown;
}

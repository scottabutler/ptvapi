export const getQueryVariable = (variable: string): string => {
    const query = window.location.search.substring(1);
    const vars = query.split("&");
    for (var i = 0; i < vars.length; i++) {
        const pair = vars[i].split("=");
        if (pair[0] == variable) {
            return pair[1];
        }
    }
    return "";
}

export const updateQueryVariable = (key: string, value: string): string => {
    const query = window.location.search.substring(1);
    const vars = query.split("&");
    let result = "";
    for (var i = 0; i < vars.length; i++) {
        const pair = vars[i].split("=");
        if (pair[0] == key) {
            result = result + "&" + pair[0] + "=" + value;
        } else {
            result = result + "&" + pair[0] + "=" + pair[1];
        }
    }
    return "?" + result.substring(1);
}